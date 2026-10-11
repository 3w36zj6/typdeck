import {
  batch,
  createEffect,
  createMemo,
  createResource,
  createSignal,
  For,
  on,
  onCleanup,
  onMount,
  Show,
} from "solid-js";
import { parseMetadata } from "./types/metadata";
import { Icon } from "@iconify-icon/solid";
import { adjacentVisiblePage, hashForPage, pageFromHash } from "./navigation";
import {
  actionForKey,
  endSlidePage,
  formatElapsedTime,
  formatRemainingTime,
  nextPreviewPage,
  pageLabel,
  presentationDurationMinutes,
  presentationPace,
  presentationPositionLabel,
  presentationStartAt,
  previousPresentationPage,
  remainingSeconds,
  savedSlidePage,
} from "./presentation";
import { createPresentationSync } from "./presentationSync";
import {
  getDocument,
  GlobalWorkerOptions,
  type PDFDocumentLoadingTask,
} from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { PdfSlide } from "./PdfSlide";

GlobalWorkerOptions.workerSrc = pdfWorker;

type MenuIconProps = {
  icon: string;
};

const MenuIcon = (props: MenuIconProps) => {
  return (
    <Icon
      class="menu-icon"
      aria-hidden="true"
      icon={props.icon}
      width="32"
      height="32"
    />
  );
};

const IconSeparator = () => (
  <div
    class="icon-separator"
    style={{
      "border-left": "1px solid #444",
      height: "32px",
    }}
  />
);

const ShortcutDialog = (props: {
  setDialog: (dialog: HTMLDialogElement) => void;
}) => (
  <dialog
    ref={props.setDialog}
    aria-label="Keyboard shortcuts"
    class="shortcut-dialog"
    onClick={(event) => {
      if (event.target === event.currentTarget) event.currentTarget.close();
    }}
  >
    <div>
      <h2>Keyboard shortcuts</h2>
      <dl>
        <dt>
          <kbd>← / ↑</kbd>
        </dt>
        <dd>Previous slide</dd>
        <dt>
          <kbd>→ / ↓</kbd>
        </dt>
        <dd>Next slide</dd>
        <dt>
          <kbd>End</kbd>
        </dt>
        <dd>Go to the end slide</dd>
        <dt>
          <kbd>Shift+M</kbd>
        </dt>
        <dd>Go to the saved slide</dd>
        <dt>
          <kbd>S</kbd>
        </dt>
        <dd>Start or resume the timer (Presenter View)</dd>
        <dt>
          <kbd>P</kbd>
        </dt>
        <dd>Pause or resume the timer (Presenter View)</dd>
        <dt>
          <kbd>B</kbd>
        </dt>
        <dd>Toggle blackout</dd>
        <dt>
          <kbd>?</kbd>
        </dt>
        <dd>Open this list</dd>
        <dt>
          <kbd>Esc</kbd>
        </dt>
        <dd>Close this list</dd>
      </dl>
      <form method="dialog">
        <button>Close</button>
      </form>
    </div>
  </dialog>
);

const App = () => {
  const [metadata] = createResource(async () => {
    const response = await fetch("./metadata.json");
    if (!response.ok) {
      throw new Error(`failed to load metadata: ${response.status}`);
    }
    if (!response.headers.get("content-type")?.includes("application/json")) {
      throw new Error("metadata endpoint did not return JSON");
    }
    return parseMetadata(await response.json());
  });
  let pdfLoadingTask: PDFDocumentLoadingTask | undefined;
  const [pdfDocument] = createResource(
    () => metadata.state === "ready" && metadata(),
    async ({ pageCount }) => {
      pdfLoadingTask = getDocument({ url: "./deck.pdf" });
      const document = await pdfLoadingTask.promise;
      if (document.numPages !== pageCount) {
        throw new Error("PDF page count does not match typdeck metadata");
      }
      return document;
    },
  );

  const getPageFromHash = () => pageFromHash(window.location.hash, metadata());
  const urlParams = new URLSearchParams(window.location.search);
  const isPresenterMode = urlParams.get("mode") === "presenter";
  const { currentPage, setCurrentPage, isBlackout, setIsBlackout } =
    createPresentationSync(
      pageFromHash(window.location.hash),
      urlParams.has("blackout"),
      () => metadata()?.pageCount,
    );
  const [currentTime, setCurrentTime] = createSignal(Date.now());
  const [timerTime, setTimerTime] = createSignal(performance.now());
  const [elapsedMilliseconds, setElapsedMilliseconds] = createSignal(0);
  const [timerStartedAt, setTimerStartedAt] = createSignal<number | null>();
  const [scheduledStartAt, setScheduledStartAt] = createSignal<number>();
  const [autoAdvanceSeconds, setAutoAdvanceSeconds] = createSignal(10);
  const [autoAdvanceState, setAutoAdvanceState] = createSignal<
    "stopped" | "running" | "paused"
  >("stopped");
  const [autoAdvanceDeadline, setAutoAdvanceDeadline] = createSignal<number>();
  const [autoAdvanceRemaining, setAutoAdvanceRemaining] = createSignal(10_000);
  const elapsedSeconds = createMemo(() => {
    const startedAt = timerStartedAt();
    return Math.floor(
      (elapsedMilliseconds() +
        (typeof startedAt === "number"
          ? Math.max(0, timerTime() - startedAt)
          : 0)) /
        1000,
    );
  });
  const remainingTime = createMemo(() => {
    const deck = metadata();
    if (!deck) return;
    const duration = presentationDurationMinutes(deck);
    if (duration === undefined) return;
    const seconds = remainingSeconds(duration, elapsedSeconds());
    const lastMinutes = deck.lastMinutes;
    return {
      seconds,
      warning: lastMinutes !== undefined && seconds <= lastMinutes * 60,
    };
  });
  const pace = createMemo(() => {
    const deck = metadata();
    return deck
      ? presentationPace(deck, currentPage(), elapsedSeconds())
      : undefined;
  });
  let shortcutDialog!: HTMLDialogElement;
  const setShortcutDialog = (dialog: HTMLDialogElement) => {
    shortcutDialog = dialog;
  };
  const startTimer = (elapsedBeforeStart = elapsedMilliseconds()) => {
    const wallTime = Date.now();
    const now = performance.now();
    batch(() => {
      setCurrentTime(wallTime);
      setTimerTime(now);
      setElapsedMilliseconds(elapsedBeforeStart);
      setTimerStartedAt(now);
    });
  };
  const toggleTimer = () => {
    const startedAt = timerStartedAt();
    if (typeof startedAt !== "number") {
      startTimer();
      return;
    }

    const now = performance.now();
    batch(() => {
      setTimerTime(now);
      setElapsedMilliseconds(
        (elapsed) => elapsed + Math.max(0, now - startedAt),
      );
      setTimerStartedAt(null);
    });
  };
  const resetElapsedSeconds = () => {
    const startedAt = timerStartedAt();
    if (startedAt === undefined) return;
    const now = performance.now();
    batch(() => {
      setTimerTime(now);
      setElapsedMilliseconds(0);
      if (typeof startedAt === "number") setTimerStartedAt(now);
    });
  };
  const stopAutoAdvance = () => {
    batch(() => {
      setAutoAdvanceState("stopped");
      setAutoAdvanceDeadline(undefined);
      setAutoAdvanceRemaining(autoAdvanceSeconds() * 1000);
    });
  };
  const startAutoAdvance = () => {
    const duration = autoAdvanceSeconds() * 1000;
    batch(() => {
      setAutoAdvanceState("running");
      setAutoAdvanceRemaining(duration);
      setAutoAdvanceDeadline(performance.now() + duration);
    });
  };
  const pauseAutoAdvance = () => {
    const deadline = autoAdvanceDeadline();
    if (deadline === undefined) return;
    batch(() => {
      setAutoAdvanceRemaining(Math.max(0, deadline - performance.now()));
      setAutoAdvanceDeadline(undefined);
      setAutoAdvanceState("paused");
    });
  };
  const resumeAutoAdvance = () => {
    setAutoAdvanceState("running");
    setAutoAdvanceDeadline(performance.now() + autoAdvanceRemaining());
  };
  const changeAutoAdvanceSeconds = (input: HTMLInputElement) => {
    if (!input.checkValidity()) {
      input.value = String(autoAdvanceSeconds());
      return;
    }
    const seconds = input.valueAsNumber;
    const duration = seconds * 1000;
    setAutoAdvanceSeconds(seconds);
    setAutoAdvanceRemaining(duration);
    if (autoAdvanceState() === "running") {
      setAutoAdvanceDeadline(performance.now() + duration);
    }
  };
  const [isMenuVisible, setIsMenuVisible] = createSignal(true);
  let hideMenuTimeout: number;

  const toggleBlackout = () => setIsBlackout((value) => !value);

  const showMenu = () => {
    setIsMenuVisible(true);
    window.clearTimeout(hideMenuTimeout);
    hideMenuTimeout = window.setTimeout(() => {
      setIsMenuVisible(false);
    }, 3000);
  };

  const toggleFullScreen = async () => {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen();
    } else {
      await document.exitFullscreen();
    }
  };

  const [isTransitioning, setIsTransitioning] = createSignal(false);
  const TRANSITION_DURATION_MS = 150;

  const previousPage = () => {
    const deck = metadata();
    return deck ? previousPresentationPage(deck, currentPage()) : currentPage();
  };
  const nextPage = () => {
    const deck = metadata();
    return deck ? adjacentVisiblePage(deck, currentPage(), 1) : currentPage();
  };
  const previewPage = () => {
    const deck = metadata();
    return deck ? nextPreviewPage(deck, currentPage()) : currentPage();
  };

  const goPreviousPage = () => {
    if (isTransitioning()) return;
    setIsTransitioning(true);
    setCurrentPage(previousPage());
    window.setTimeout(() => setIsTransitioning(false), TRANSITION_DURATION_MS);
  };

  const goNextPage = () => {
    if (isTransitioning()) return;
    if (!metadata()) return;
    setIsTransitioning(true);
    setCurrentPage(nextPage());
    window.setTimeout(() => setIsTransitioning(false), TRANSITION_DURATION_MS);
  };

  const handleKeyDown = (event: KeyboardEvent) => {
    if (
      event.target instanceof HTMLElement &&
      event.target.closest("input, select, textarea, [contenteditable]")
    ) {
      return;
    }
    if (shortcutDialog.open || !metadata()) return;

    const action = actionForKey(event);
    if (
      !action ||
      (!isPresenterMode &&
        (action === "start-timer" || action === "toggle-timer"))
    ) {
      return;
    }
    event.preventDefault();

    switch (action) {
      case "previous":
        goPreviousPage();
        break;
      case "next":
        goNextPage();
        break;
      case "last":
        setCurrentPage(endSlidePage(metadata()!));
        break;
      case "saved": {
        const page = savedSlidePage(metadata()!);
        if (page !== undefined) setCurrentPage(page);
        break;
      }
      case "blackout":
        toggleBlackout();
        break;
      case "start-timer":
        if (typeof timerStartedAt() !== "number") startTimer();
        break;
      case "toggle-timer":
        if (timerStartedAt() !== undefined) toggleTimer();
        break;
      case "shortcuts":
        shortcutDialog.showModal();
        break;
    }
  };

  createEffect(() => {
    if (metadata()) {
      const page = getPageFromHash();
      setCurrentPage(Math.min(page, metadata()!.pageCount));
    }
  });

  createEffect(() => {
    const page = currentPage();
    if (page !== getPageFromHash()) {
      window.location.hash = hashForPage(page, metadata());
    }
  });

  createEffect(() => {
    const deck = metadata();
    document.title = deck
      ? `${pageLabel(deck, currentPage())}${deck.title ? ` — ${deck.title}` : ""} — typdeck ${isPresenterMode ? "Presenter" : "Stage"}`
      : "typdeck";
  });

  let timerInitialized = !isPresenterMode;
  createEffect(() => {
    const deck = metadata();
    if (!deck || timerInitialized) return;
    timerInitialized = true;
    const now = Date.now();
    const startAt = presentationStartAt(deck, now);
    setCurrentTime(now);
    setScheduledStartAt(startAt);
    if (startAt !== undefined && startAt <= now) startTimer(now - startAt);
  });

  createEffect(() => {
    const startAt = scheduledStartAt();
    if (
      startAt !== undefined &&
      timerStartedAt() === undefined &&
      currentTime() >= startAt
    ) {
      startTimer(currentTime() - startAt);
    }
  });

  createEffect(() => {
    const deck = metadata();
    if (!deck || timerStartedAt() !== undefined) return;
    if (currentPage() !== adjacentVisiblePage(deck, 0, 1)) startTimer();
  });

  createEffect(
    on(
      currentPage,
      () => {
        const state = autoAdvanceState();
        if (state === "stopped") return;
        const duration = autoAdvanceSeconds() * 1000;
        if (nextPage() === currentPage()) stopAutoAdvance();
        else if (state === "running") {
          setAutoAdvanceDeadline(performance.now() + duration);
        } else setAutoAdvanceRemaining(duration);
      },
      { defer: true },
    ),
  );

  createEffect(() => {
    const deadline = autoAdvanceDeadline();
    const deck = metadata();
    const page = currentPage();
    const next = deck ? adjacentVisiblePage(deck, page, 1) : page;
    if (
      autoAdvanceState() !== "running" ||
      deadline === undefined ||
      next === page
    ) {
      return;
    }
    const timeout = window.setTimeout(
      () => setCurrentPage(next),
      Math.max(0, deadline - performance.now()),
    );
    onCleanup(() => window.clearTimeout(timeout));
  });

  onMount(() => {
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("mousemove", showMenu);
    window.addEventListener("touchstart", showMenu);

    if (isPresenterMode) {
      const intervalId = window.setInterval(() => {
        batch(() => {
          setCurrentTime(Date.now());
          setTimerTime(performance.now());
        });
      }, 1000);
      onCleanup(() => {
        window.clearInterval(intervalId);
      });
    }

    onCleanup(() => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("mousemove", showMenu);
      window.removeEventListener("touchstart", showMenu);
      window.clearTimeout(hideMenuTimeout);
    });
  });

  onCleanup(() => {
    void pdfLoadingTask?.destroy();
  });

  const openPresenterWindow = () => {
    const url = new URL(window.location.href);
    url.search = "";
    url.searchParams.set("mode", "presenter");
    if (isBlackout()) url.searchParams.set("blackout", "1");
    url.hash = hashForPage(currentPage(), metadata());
    window.open(
      url.href,
      `typdeck-presenter:${url.origin}${url.pathname}`,
      "width=1024,height=768",
    );
  };

  return (
    <Show
      when={!metadata.error && !pdfDocument.error}
      fallback={
        <main role="alert">Could not load this typdeck presentation.</main>
      }
    >
      <Show
        when={isPresenterMode}
        fallback={
          <>
            <div
              class="slide-container"
              lang={metadata()?.language}
              style={{
                width: "100vw",
                height: "100vh",
                overflow: "hidden",
                position: "relative",
                background: "black",
              }}
            >
              <Show when={!pdfDocument.error && pdfDocument()}>
                {(document) => (
                  <div
                    class="slide"
                    style={{
                      width: "100%",
                      height: "100%",
                      position: "relative",
                    }}
                  >
                    <PdfSlide
                      document={document()}
                      page={currentPage()}
                      label={pageLabel(metadata()!, currentPage())}
                      onNavigate={setCurrentPage}
                    />
                  </div>
                )}
              </Show>
            </div>
            <Show when={isBlackout()}>
              <div
                aria-hidden="true"
                style={{
                  position: "fixed",
                  inset: "0",
                  background: "#000",
                  "z-index": "1",
                }}
              />
            </Show>
            <div
              class="menu"
              style={{
                position: "fixed",
                bottom: "20px",
                left: "50%",
                transform: "translateX(-50%)",
                background: "rgba(0, 0, 0, 0.5)",
                width: "max-content",
                "max-width": "calc(100vw - 20px)",
                "box-sizing": "border-box",
                padding: "10px",
                "border-radius": "5px",
                display: "flex",
                "flex-direction": "column",
                gap: "5px",
                opacity: isMenuVisible() ? "1" : "0",
                transition: "opacity 0.3s",
                "pointer-events": isMenuVisible() ? "auto" : "none",
                "z-index": "2",
              }}
            >
              <div
                class="menu-row"
                style={{
                  width: "100%",
                  height: "36px",
                  display: "grid",
                  "grid-template-columns": "auto minmax(0, 1fr) auto",
                  "align-items": "center",
                  gap: "8px",
                }}
              >
                <button
                  class="icon-button"
                  onClick={goPreviousPage}
                  aria-label="Previous slide"
                  disabled={previousPage() === currentPage()}
                  style={{ height: "100%" }}
                >
                  <MenuIcon icon="lucide:chevron-left" />
                </button>
                <span
                  role="status"
                  aria-atomic="true"
                  style={{
                    color: "#fff",
                    "font-size": "14px",
                    "line-height": "16px",
                    "min-width": "0",
                    "white-space": "pre-line",
                    "text-align": "center",
                  }}
                >
                  {metadata()
                    ? presentationPositionLabel(metadata()!, currentPage())
                    : ""}
                </span>
                <button
                  class="icon-button"
                  onClick={goNextPage}
                  aria-label="Next slide"
                  disabled={nextPage() === currentPage()}
                  style={{ height: "100%" }}
                >
                  <MenuIcon icon="lucide:chevron-right" />
                </button>
              </div>
              <div
                class="menu-row"
                style={{
                  position: "relative",
                  width: "100%",
                  height: "32px",
                  display: "flex",
                  "align-items": "center",
                  "justify-content": "center",
                  gap: "10px",
                }}
              >
                <button
                  class="icon-button"
                  onClick={toggleFullScreen}
                  aria-label="Toggle fullscreen"
                  style={{ height: "100%" }}
                >
                  <MenuIcon icon="lucide:fullscreen" />
                </button>
                <button
                  class="icon-button"
                  onClick={() => {
                    openPresenterWindow();
                  }}
                  aria-label="Open presenter view"
                  style={{ height: "100%" }}
                >
                  <MenuIcon icon="lucide:presentation" />
                </button>
                <button
                  class="icon-button"
                  onClick={toggleBlackout}
                  aria-label="Blackout"
                  aria-pressed={isBlackout()}
                  data-tooltip={
                    isBlackout() ? "Turn blackout off" : "Turn blackout on"
                  }
                  style={{ height: "100%" }}
                >
                  <MenuIcon
                    icon={isBlackout() ? "lucide:monitor" : "lucide:monitor-x"}
                  />
                </button>
                <button
                  class="icon-button"
                  onClick={() => shortcutDialog.showModal()}
                  aria-label="Show keyboard shortcuts"
                  data-tooltip="Show keyboard shortcuts"
                  style={{ height: "100%" }}
                >
                  <MenuIcon icon="lucide:circle-help" />
                </button>
              </div>
            </div>
            <ShortcutDialog setDialog={setShortcutDialog} />
          </>
        }
      >
        <div
          class="presenter-container"
          style={{
            width: "100vw",
            height: "100vh",
            display: "flex",
            "flex-direction": "column",
            background: "black",
            color: "#fff",
            overflow: "hidden",
            margin: "0",
            padding: "0",
          }}
        >
          <div
            class="slides"
            style={{
              flex: "1 1 auto",
              "min-height": "0",
              display: "flex",
              "justify-content": "space-between",
              overflow: "hidden",
            }}
          >
            <Show when={!pdfDocument.error && pdfDocument()}>
              {(document) => (
                <>
                  <div
                    class="current-slide"
                    lang={metadata()?.language}
                    style={{
                      width: "49%",
                      display: "flex",
                      "align-items": "center",
                      "justify-content": "center",
                      overflow: "hidden",
                    }}
                  >
                    <PdfSlide
                      document={document()}
                      page={currentPage()}
                      label={`Current slide: ${pageLabel(
                        metadata()!,
                        currentPage(),
                      )}`}
                      onNavigate={setCurrentPage}
                    />
                  </div>
                  <div
                    class="next-slide"
                    lang={metadata()?.language}
                    style={{
                      width: "49%",
                      display: "flex",
                      "align-items": "center",
                      "justify-content": "center",
                      overflow: "hidden",
                    }}
                  >
                    <PdfSlide
                      document={document()}
                      page={previewPage()}
                      label={`Next slide: ${pageLabel(
                        metadata()!,
                        previewPage(),
                      )}`}
                      opacity={0.5}
                      onNavigate={setCurrentPage}
                    />
                  </div>
                </>
              )}
            </Show>
          </div>
          <div
            class="speaker-notes"
            style={{
              padding: "10px",
              "border-top": "1px solid #333",
              "background-color": "#111",
              height: "200px",
              "overflow-y": "auto",
              "flex-shrink": "0",
            }}
          >
            {metadata()?.slides?.[`${currentPage()}`]?.speakerNotes ? (
              <p
                lang={metadata()?.language}
                style={{
                  margin: "0",
                  "white-space": "pre-wrap",
                  "word-break": "break-word",
                }}
              >
                {metadata()!.slides?.[`${currentPage()}`]?.speakerNotes}
              </p>
            ) : (
              <p style={{ margin: "0", color: "#666", "font-style": "italic" }}>
                No speaker notes for this slide.
              </p>
            )}
          </div>
          <div
            class="presenter-footer"
            style={{
              display: "flex",
              "flex-wrap": "wrap",
              "justify-content": "space-between",
              "align-items": "center",
              gap: "10px",
              padding: "10px",
              "background-color": "#222",
              "min-height": "32px",
              "flex-shrink": "0",
            }}
          >
            <div
              style={{
                display: "flex",
                "flex-wrap": "wrap",
                gap: "10px",
                "align-items": "center",
              }}
            >
              <Icon
                icon="lucide:clock"
                width="32"
                height="32"
                style={{
                  color: "#fff",
                }}
              />

              <Show
                when={timerStartedAt() === undefined && scheduledStartAt()}
                fallback={
                  <div
                    role="timer"
                    aria-label="Elapsed time"
                    style={{ "font-size": "32px" }}
                  >
                    {formatElapsedTime(elapsedSeconds())}
                  </div>
                }
              >
                {(startAt) => (
                  <div
                    role="timer"
                    aria-label="Time until scheduled start"
                    style={{ "font-size": "32px" }}
                  >
                    Starts in{" "}
                    {formatElapsedTime(
                      Math.max(
                        0,
                        Math.ceil((startAt() - currentTime()) / 1000),
                      ),
                    )}
                  </div>
                )}
              </Show>
              <Show
                when={
                  timerStartedAt() !== undefined ? remainingTime() : undefined
                }
              >
                {(remaining) => (
                  <div
                    role="timer"
                    aria-label={
                      remaining().seconds < 0
                        ? "Overtime"
                        : remaining().warning
                          ? "Remaining time warning"
                          : "Remaining time"
                    }
                    style={{
                      display: "flex",
                      gap: "4px",
                      color: remaining().warning ? "#ffb020" : "inherit",
                    }}
                  >
                    <span>
                      {remaining().seconds < 0
                        ? "Overtime"
                        : remaining().warning
                          ? "Ending soon"
                          : "Remaining"}
                    </span>
                    <span>{formatRemainingTime(remaining().seconds)}</span>
                  </div>
                )}
              </Show>
              <Show when={timerStartedAt() !== undefined && pace()}>
                {(currentPace) => (
                  <div
                    aria-label="Presentation pace"
                    data-status={currentPace().status}
                    style={{
                      color:
                        currentPace().status === "ahead"
                          ? "#7db7ff"
                          : currentPace().status === "behind"
                            ? "#ffb020"
                            : "inherit",
                    }}
                  >
                    {currentPace().status === "on-pace"
                      ? "On pace"
                      : `${currentPace().status === "ahead" ? "Ahead" : "Behind"} ${formatElapsedTime(Math.abs(currentPace().differenceSeconds))}`}
                  </div>
                )}
              </Show>
              <IconSeparator />
              <Show when={timerStartedAt() === undefined}>
                <button
                  class="icon-button"
                  onClick={() => startTimer()}
                  aria-label="Start timer"
                  style={{ height: "32px" }}
                >
                  <MenuIcon icon="lucide:play" />
                </button>
              </Show>
              <Show when={timerStartedAt() !== undefined}>
                <button
                  class="icon-button"
                  onClick={toggleTimer}
                  aria-label={
                    timerStartedAt() === null ? "Resume timer" : "Pause timer"
                  }
                  style={{ height: "32px" }}
                >
                  <MenuIcon
                    icon={
                      timerStartedAt() === null ? "lucide:play" : "lucide:pause"
                    }
                  />
                </button>
              </Show>
              <button
                class="icon-button"
                onClick={resetElapsedSeconds}
                aria-label="Reset timer"
                disabled={timerStartedAt() === undefined}
                style={{ height: "32px" }}
              >
                <MenuIcon icon="lucide:timer-reset" />
              </button>
              <label
                style={{
                  display: "flex",
                  "align-items": "center",
                  gap: "4px",
                }}
              >
                Auto
                <input
                  aria-label="Auto advance interval in seconds"
                  type="number"
                  min="1"
                  step="1"
                  required
                  value={autoAdvanceSeconds()}
                  onChange={(event) =>
                    changeAutoAdvanceSeconds(event.currentTarget)
                  }
                  style={{ width: "4em" }}
                />
                s
              </label>
              <button
                class="icon-button"
                onClick={() =>
                  autoAdvanceState() === "stopped"
                    ? startAutoAdvance()
                    : stopAutoAdvance()
                }
                aria-label={
                  autoAdvanceState() === "stopped"
                    ? "Start auto advance"
                    : "Stop auto advance"
                }
                data-tooltip={
                  autoAdvanceState() === "stopped"
                    ? "Start auto advance"
                    : "Stop auto advance"
                }
                disabled={
                  autoAdvanceState() === "stopped" &&
                  (!metadata() || nextPage() === currentPage())
                }
                style={{ height: "32px" }}
              >
                <MenuIcon
                  icon={
                    autoAdvanceState() === "stopped"
                      ? "lucide:play"
                      : "lucide:square"
                  }
                />
              </button>
              <button
                class="icon-button"
                onClick={() =>
                  autoAdvanceState() === "paused"
                    ? resumeAutoAdvance()
                    : pauseAutoAdvance()
                }
                aria-label={
                  autoAdvanceState() === "paused"
                    ? "Resume auto advance"
                    : "Pause auto advance"
                }
                data-tooltip={
                  autoAdvanceState() === "paused"
                    ? "Resume auto advance"
                    : "Pause auto advance"
                }
                disabled={autoAdvanceState() === "stopped"}
                style={{ height: "32px" }}
              >
                <MenuIcon
                  icon={
                    autoAdvanceState() === "paused"
                      ? "lucide:play"
                      : "lucide:pause"
                  }
                />
              </button>
              <button
                class="icon-button"
                onClick={toggleBlackout}
                aria-label="Blackout"
                aria-pressed={isBlackout()}
                data-tooltip={
                  isBlackout() ? "Turn blackout off" : "Turn blackout on"
                }
                style={{ height: "32px" }}
              >
                <MenuIcon
                  icon={isBlackout() ? "lucide:monitor" : "lucide:monitor-x"}
                />
              </button>
              <button
                class="icon-button"
                onClick={() => shortcutDialog.showModal()}
                aria-label="Show keyboard shortcuts"
                data-tooltip="Show keyboard shortcuts"
                style={{ height: "32px" }}
              >
                <MenuIcon icon="lucide:circle-help" />
              </button>
            </div>
            <Show when={metadata()}>
              {(deck) => (
                <select
                  aria-label="Slide list"
                  value={currentPage()}
                  onChange={(event) =>
                    setCurrentPage(Number(event.currentTarget.value))
                  }
                  style={{
                    color: "#fff",
                    background: "#222",
                    border: "1px solid #555",
                    "border-radius": "4px",
                    padding: "5px 8px",
                    "max-width": "32vw",
                  }}
                >
                  <For
                    each={Array.from(
                      { length: deck().pageCount },
                      (_, i) => i + 1,
                    )}
                  >
                    {(pageNumber) => (
                      <option value={pageNumber}>
                        {pageLabel(deck(), pageNumber)}
                      </option>
                    )}
                  </For>
                </select>
              )}
            </Show>
            <div
              style={{ display: "flex", gap: "10px", "align-items": "center" }}
            >
              <button
                class="icon-button"
                onClick={goPreviousPage}
                aria-label="Previous slide"
                disabled={previousPage() === currentPage()}
                style={{ height: "32px" }}
              >
                <MenuIcon icon="lucide:chevron-left" />
              </button>
              <span
                role="status"
                aria-atomic="true"
                style={{
                  color: "#fff",
                  "font-size": "14px",
                  "line-height": "16px",
                  "min-width": "120px",
                  "white-space": "pre-line",
                  "text-align": "center",
                }}
              >
                {metadata()
                  ? presentationPositionLabel(metadata()!, currentPage())
                  : ""}
              </span>
              <button
                class="icon-button"
                onClick={goNextPage}
                aria-label="Next slide"
                disabled={nextPage() === currentPage()}
                style={{ height: "32px" }}
              >
                <MenuIcon icon="lucide:chevron-right" />
              </button>
            </div>
          </div>
          <ShortcutDialog setDialog={setShortcutDialog} />
        </div>
      </Show>
    </Show>
  );
};

export default App;
