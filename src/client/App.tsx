import {
  createEffect,
  createResource,
  createSignal,
  For,
  onCleanup,
  onMount,
  Show,
} from "solid-js";
import { parseMetadata } from "./types/metadata";
import { Icon } from "@iconify-icon/solid";
import { adjacentVisiblePage, hashForPage, pageFromHash } from "./navigation";
import { actionForKey, formatElapsedTime, pageLabel } from "./presentation";
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
  const [elapsedSeconds, setElapsedSeconds] = createSignal(0);
  let shortcutDialog!: HTMLDialogElement;
  const setShortcutDialog = (dialog: HTMLDialogElement) => {
    shortcutDialog = dialog;
  };
  const resetElapsedSeconds = () => {
    setElapsedSeconds(0);
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
    return deck ? adjacentVisiblePage(deck, currentPage(), -1) : currentPage();
  };
  const nextPage = () => {
    const deck = metadata();
    return deck ? adjacentVisiblePage(deck, currentPage(), 1) : currentPage();
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

    switch (actionForKey(event)) {
      case "previous":
        goPreviousPage();
        break;
      case "next":
        goNextPage();
        break;
      case "blackout":
        toggleBlackout();
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

  onMount(() => {
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("mousemove", showMenu);
    window.addEventListener("touchstart", showMenu);

    if (isPresenterMode) {
      const intervalId = window.setInterval(() => {
        setElapsedSeconds((prev) => prev + 1);
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
                  position: "relative",
                  width: "100%",
                  height: "32px",
                  display: "flex",
                  "align-items": "center",
                  "justify-content": "center",
                }}
              >
                <button
                  class="icon-button"
                  onClick={goPreviousPage}
                  aria-label="Previous slide"
                  disabled={previousPage() === currentPage()}
                  style={{ position: "absolute", left: "0", height: "100%" }}
                >
                  <MenuIcon icon="lucide:chevron-left" />
                </button>
                <span
                  style={{
                    color: "#fff",
                    "min-width": "200px",
                    "text-align": "center",
                  }}
                >
                  Page {currentPage()}{" "}
                  {metadata() ? `of ${metadata()!.pageCount}` : ""}
                </span>
                <button
                  class="icon-button"
                  onClick={goNextPage}
                  aria-label="Next slide"
                  disabled={nextPage() === currentPage()}
                  style={{ position: "absolute", right: "0", height: "100%" }}
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
                      page={nextPage()}
                      label={`Next slide: ${pageLabel(
                        metadata()!,
                        nextPage(),
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
              "justify-content": "space-between",
              "align-items": "center",
              padding: "10px",
              "background-color": "#222",
              height: "32px",
              "flex-shrink": "0",
            }}
          >
            <div
              style={{
                height: "32px",
                display: "flex",
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

              <div
                style={{
                  "font-size": "32px",
                }}
              >
                {formatElapsedTime(elapsedSeconds())}
              </div>
              <IconSeparator />
              <button
                class="icon-button"
                onClick={resetElapsedSeconds}
                aria-label="Reset timer"
                style={{ height: "32px" }}
              >
                <MenuIcon icon="lucide:timer-reset" />
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
                style={{
                  color: "#fff",
                  "font-size": "16px",
                  "min-width": "120px",
                  "text-align": "center",
                }}
              >
                Page {currentPage()} of {metadata() ? metadata()!.pageCount : 0}
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
