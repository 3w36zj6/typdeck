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
  completedSlidePage,
  endSlidePage,
  formatElapsedTime,
  formatRemainingTime,
  logicalSlideStartPage,
  nextPreviewPage,
  pageLabel,
  presentationDurationMinutes,
  presentationPace,
  presentationPositionLabel,
  presentationStartAt,
  previousPresentationPage,
  remainingSeconds,
  savedSlidePage,
  type DrawingStroke,
  type SlidePoint,
  type SlidePointer,
  type SlideRect,
} from "./presentation";
import { createPresentationSync } from "./presentationSync";
import {
  getDocument,
  GlobalWorkerOptions,
  type PDFDocumentLoadingTask,
} from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { PdfSlide } from "./PdfSlide";
import { SlideOverviewDialog } from "./SlideOverviewDialog";
import { SlideSearchDialog } from "./SlideSearchDialog";

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
          <kbd>← / ↑ / PageUp / Backspace</kbd>
        </dt>
        <dd>Previous slide</dd>
        <dt>
          <kbd>→ / ↓ / PageDown / Space / Enter</kbd>
        </dt>
        <dd>Next slide</dd>
        <dt>
          <kbd>Home / End</kbd>
        </dt>
        <dd>Go to the first / end slide</dd>
        <dt>
          <kbd>/ / Ctrl/Cmd+K</kbd>
        </dt>
        <dd>Search slide text</dd>
        <dt>
          <kbd>O</kbd>
        </dt>
        <dd>Open slide overview</dd>
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
          <kbd>Shift+F</kbd>
        </dt>
        <dd>Freeze or unfreeze the Stage (Presenter View)</dd>
        <dt>
          <kbd>1 / 2 / 3 / 4 / 5</kbd>
        </dt>
        <dd>Normal / laser / pen / eraser / spotlight mode (Presenter View)</dd>
        <dt>
          <kbd>D / C</kbd>
        </dt>
        <dd>Hide / clear drawings (Presenter View)</dd>
        <dt>
          <kbd>Ctrl/Cmd+Z / Ctrl/Cmd+Y</kbd>
        </dt>
        <dd>Undo / redo drawings (Presenter View)</dd>
        <dt>
          <kbd>?</kbd>
        </dt>
        <dd>Open this list</dd>
        <dt>
          <kbd>Esc</kbd>
        </dt>
        <dd>Clear freeze, zoom, and the active tool</dd>
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
  const [searchRequested, setSearchRequested] = createSignal(false);
  const [searchableSlides] = createResource(
    () => {
      const document = pdfDocument();
      const deck = metadata();
      return searchRequested() && document && deck
        ? { document, deck }
        : undefined;
    },
    async ({ document, deck }) =>
      Promise.all(
        Array.from({ length: document.numPages }, async (_, index) => {
          const page = index + 1;
          const content = await (await document.getPage(page)).getTextContent();
          return {
            page,
            logicalSlide: deck.slides?.[`${page}`]?.logicalSlide,
            text: content.items
              .map((item) =>
                "str" in item ? `${item.str}${item.hasEOL ? "\n" : " "}` : "",
              )
              .join(""),
          };
        }),
      ),
  );

  const getPageFromHash = () => pageFromHash(window.location.hash, metadata());
  const urlParams = new URLSearchParams(window.location.search);
  const isPresenterMode = urlParams.get("mode") === "presenter";
  const {
    activeDrawing,
    setActiveDrawing,
    currentPage,
    setCurrentPage,
    isBlackout,
    setIsBlackout,
    drawings,
    setDrawings,
    drawingsHidden,
    setDrawingsHidden,
    frozenPage,
    setFrozenPage,
    pointer,
    setPointer,
    zoom,
    setZoom,
  } = createPresentationSync(
    pageFromHash(window.location.hash),
    urlParams.has("blackout"),
    () => metadata()?.pageCount,
  );
  const [pointerMode, setPointerMode] = createSignal<
    "none" | SlidePointer["kind"]
  >("none");
  const [drawingTool, setDrawingTool] = createSignal<
    "none" | DrawingStroke["kind"]
  >("none");
  const [isSelectingZoom, setIsSelectingZoom] = createSignal(false);
  const [penColor, setPenColor] = createSignal("#ff2222");
  const [redoStrokes, setRedoStrokes] = createSignal<DrawingStroke[]>([]);
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
  let overviewDialog!: HTMLDialogElement;
  let searchDialog!: HTMLDialogElement;
  let searchInput!: HTMLInputElement;
  const [searchPage, setSearchPage] = createSignal(1);
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
  let pointerHideTimeout: number;

  const toggleBlackout = () => setIsBlackout((value) => !value);

  const stagePage = () => frozenPage() ?? currentPage();

  const toggleFreeze = () =>
    setFrozenPage((page) => (page === null ? currentPage() : null));

  const pointerForPage = (page: number) => {
    const value = pointer();
    return value?.page === page ? value : undefined;
  };

  const zoomForPage = (page: number) => {
    const value = zoom();
    return value?.page === page ? value : undefined;
  };

  const updatePointer = (point: SlidePoint | undefined) => {
    window.clearTimeout(pointerHideTimeout);
    const kind = pointerMode();
    if (!point || kind === "none") {
      setPointer(null);
      return;
    }
    setPointer({ ...point, kind, page: currentPage() });
    pointerHideTimeout = window.setTimeout(() => setPointer(null), 3000);
  };

  const endDrawing = (commit: boolean) => {
    const active = activeDrawing();
    if (!active) return;
    batch(() => {
      if (commit) setDrawings((strokes) => [...strokes, active]);
      setActiveDrawing(null);
    });
  };

  const selectInputMode = (
    mode: "normal" | "zoom" | SlidePointer["kind"] | DrawingStroke["kind"],
  ) => {
    endDrawing(false);
    setPointer(null);
    setZoom(null);
    setPointerMode(mode === "laser" || mode === "spotlight" ? mode : "none");
    setDrawingTool(mode === "pen" || mode === "eraser" ? mode : "none");
    setIsSelectingZoom(mode === "zoom");
  };

  const togglePointer = (kind: SlidePointer["kind"]) => {
    selectInputMode(pointerMode() === kind ? "normal" : kind);
  };

  const drawingPage = (page: number) => {
    const deck = metadata();
    return deck ? logicalSlideStartPage(deck, page) : page;
  };

  const drawingsForPage = (page: number) => {
    const drawing = drawingPage(page);
    return drawings().filter((stroke) => stroke.page === drawing);
  };

  const visibleDrawingsForPage = (page: number) => {
    if (drawingsHidden()) return [];
    const drawing = drawingPage(page);
    const active = activeDrawing();
    return [
      ...drawingsForPage(page),
      ...(active?.page === drawing ? [active] : []),
    ];
  };

  const startDrawing = (point: SlidePoint) => {
    const kind = drawingTool();
    if (kind === "none") return;
    const stroke: DrawingStroke = {
      page: drawingPage(currentPage()),
      points: [point, point],
      ...(kind === "pen" ? { kind, color: penColor() } : { kind }),
    };
    setRedoStrokes([]);
    setActiveDrawing(stroke);
  };

  const continueDrawing = (points: SlidePoint[]) => {
    setActiveDrawing((active) =>
      active ? { ...active, points: [...active.points, ...points] } : active,
    );
  };

  const undoDrawing = () => {
    const strokes = drawings();
    const page = drawingPage(currentPage());
    const index = strokes.findLastIndex((stroke) => stroke.page === page);
    const stroke = strokes[index];
    if (!stroke) return;
    setDrawings([...strokes.slice(0, index), ...strokes.slice(index + 1)]);
    setRedoStrokes((redo) => [...redo, stroke]);
  };

  const redoDrawing = () => {
    const redo = redoStrokes();
    const stroke = redo.at(-1);
    if (!stroke || stroke.page !== drawingPage(currentPage())) return;
    setDrawings((strokes) => [...strokes, stroke]);
    setRedoStrokes(redo.slice(0, -1));
  };

  const clearDrawings = () => {
    endDrawing(false);
    const page = drawingPage(currentPage());
    setDrawings((strokes) => strokes.filter((stroke) => stroke.page !== page));
    setRedoStrokes([]);
  };

  const toggleDrawingsVisibility = () => {
    setDrawingsHidden((hidden) => !hidden);
    if (drawingTool() !== "none") selectInputMode("normal");
  };

  const toggleDrawing = (tool: DrawingStroke["kind"]) => {
    selectInputMode(drawingTool() === tool ? "normal" : tool);
  };

  const toggleZoom = () => {
    if (zoom()) {
      setZoom(null);
      return;
    }
    selectInputMode(isSelectingZoom() ? "normal" : "zoom");
  };

  const applyZoom = (rect: SlideRect) => {
    batch(() => {
      setZoom({ ...rect, page: currentPage() });
      setIsSelectingZoom(false);
    });
  };

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

  const openSearch = () => {
    if (!metadata() || !pdfDocument()) return;
    setSearchPage(currentPage());
    setSearchRequested(true);
    searchDialog.showModal();
    searchInput.focus();
  };

  const confirmSearch = (page: number) => {
    setCurrentPage(page);
    searchDialog.close();
  };

  const openOverview = () => {
    if (!metadata() || !pdfDocument()) return;
    overviewDialog.showModal();
  };

  const confirmOverview = (page: number) => {
    setCurrentPage(page);
    overviewDialog.close();
  };

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.target instanceof Element) {
      if (
        event.target.closest("input, select, textarea, [contenteditable]") ||
        (["Enter", "NumpadEnter", "Space"].includes(event.code) &&
          event.target.closest("a, button, summary"))
      ) {
        return;
      }
    }
    if (document.querySelector("dialog:modal") || !metadata()) return;

    const action = actionForKey(event);
    if (
      !action ||
      (!isPresenterMode &&
        (action === "start-timer" ||
          action === "toggle-timer" ||
          action === "toggle-freeze" ||
          action === "toggle-drawings" ||
          action === "clear-drawings" ||
          action === "undo-drawing" ||
          action === "redo-drawing" ||
          action === "normal-mode" ||
          action === "laser-mode" ||
          action === "pen-mode" ||
          action === "eraser-mode" ||
          action === "spotlight-mode"))
    ) {
      return;
    }
    if (action !== "reset-view") event.preventDefault();

    switch (action) {
      case "previous":
        goPreviousPage();
        break;
      case "next":
        goNextPage();
        break;
      case "first":
        setCurrentPage(adjacentVisiblePage(metadata()!, 0, 1));
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
      case "toggle-freeze":
        toggleFreeze();
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
      case "search":
        openSearch();
        break;
      case "overview":
        openOverview();
        break;
      case "toggle-drawings":
        toggleDrawingsVisibility();
        break;
      case "clear-drawings":
        clearDrawings();
        break;
      case "undo-drawing":
        undoDrawing();
        break;
      case "redo-drawing":
        redoDrawing();
        break;
      case "normal-mode":
        selectInputMode("normal");
        break;
      case "laser-mode":
        selectInputMode("laser");
        break;
      case "pen-mode":
        selectInputMode("pen");
        break;
      case "eraser-mode":
        selectInputMode("eraser");
        break;
      case "spotlight-mode":
        selectInputMode("spotlight");
        break;
      case "reset-view":
        batch(() => {
          setFrozenPage(null);
          setZoom(null);
          selectInputMode("normal");
        });
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

  createEffect(
    on(
      currentPage,
      () => {
        if (isPresenterMode) endDrawing(false);
        setZoom(null);
        setIsSelectingZoom(false);
      },
      { defer: true },
    ),
  );

  createEffect(() => {
    const deck = metadata();
    document.title = deck
      ? `${pageLabel(deck, isPresenterMode ? currentPage() : stagePage())}${deck.title ? ` — ${deck.title}` : ""} — typdeck ${isPresenterMode ? "Presenter" : "Stage"}`
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
      window.clearTimeout(pointerHideTimeout);
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
                      page={stagePage()}
                      label={pageLabel(metadata()!, stagePage())}
                      pointer={pointerForPage(stagePage())}
                      zoom={zoomForPage(stagePage())}
                      drawings={visibleDrawingsForPage(stagePage())}
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
                    ? presentationPositionLabel(metadata()!, stagePage())
                    : ""}
                  {frozenPage() === null ? "" : " (frozen)"}
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
                  onClick={openOverview}
                  aria-label="Open slide overview"
                  data-tooltip="Open slide overview"
                  disabled={!pdfDocument()}
                  style={{ height: "100%" }}
                >
                  <MenuIcon icon="lucide:grid-2x2" />
                </button>
                <button
                  class="icon-button"
                  onClick={openSearch}
                  aria-label="Search slides"
                  data-tooltip="Search slides"
                  disabled={!pdfDocument()}
                  style={{ height: "100%" }}
                >
                  <MenuIcon icon="lucide:search" />
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
            <Show when={pdfDocument()}>
              {(document) => (
                <SlideOverviewDialog
                  document={document()}
                  metadata={metadata()!}
                  currentPage={completedSlidePage(metadata()!, currentPage())}
                  setDialog={(dialog) => {
                    overviewDialog = dialog;
                  }}
                  onConfirm={confirmOverview}
                />
              )}
            </Show>
            <Show when={pdfDocument()}>
              {(document) => (
                <SlideSearchDialog
                  document={document()}
                  metadata={metadata()!}
                  slides={searchableSlides()}
                  loading={searchableSlides.loading}
                  error={searchableSlides.error}
                  selectedPage={searchPage()}
                  setDialog={(dialog) => {
                    searchDialog = dialog;
                  }}
                  setInput={(input) => {
                    searchInput = input;
                  }}
                  onSelect={setSearchPage}
                  onConfirm={confirmSearch}
                />
              )}
            </Show>
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
                      pointer={pointerForPage(currentPage())}
                      zoom={zoomForPage(currentPage())}
                      drawings={visibleDrawingsForPage(currentPage())}
                      onNavigate={setCurrentPage}
                      onPointerMove={
                        pointerMode() === "none" ? undefined : updatePointer
                      }
                      onDrawStart={
                        drawingTool() === "none" ? undefined : startDrawing
                      }
                      onDrawMove={
                        drawingTool() === "none" ? undefined : continueDrawing
                      }
                      onDrawEnd={endDrawing}
                      onSelectZoom={isSelectingZoom() ? applyZoom : undefined}
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
                      drawings={visibleDrawingsForPage(previewPage())}
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
                onClick={toggleFreeze}
                aria-label="Freeze stage"
                aria-pressed={frozenPage() !== null}
                data-tooltip={
                  frozenPage() === null ? "Freeze stage" : "Unfreeze stage"
                }
                style={{ height: "32px" }}
              >
                <MenuIcon icon="lucide:panels-top-left" />
              </button>
              <button
                class="icon-button"
                onClick={() => togglePointer("laser")}
                aria-label="Laser pointer"
                aria-pressed={pointerMode() === "laser"}
                data-tooltip={
                  pointerMode() === "laser"
                    ? "Turn laser pointer off"
                    : "Turn laser pointer on"
                }
                style={{ height: "32px" }}
              >
                <MenuIcon icon="lucide:crosshair" />
              </button>
              <button
                class="icon-button"
                onClick={() => togglePointer("spotlight")}
                aria-label="Spotlight"
                aria-pressed={pointerMode() === "spotlight"}
                data-tooltip={
                  pointerMode() === "spotlight"
                    ? "Turn spotlight off"
                    : "Turn spotlight on"
                }
                style={{ height: "32px" }}
              >
                <MenuIcon icon="lucide:scan" />
              </button>
              <button
                class="icon-button"
                onClick={toggleZoom}
                aria-label={
                  zoom()
                    ? "Reset zoom"
                    : isSelectingZoom()
                      ? "Cancel zoom selection"
                      : "Select zoom area"
                }
                aria-pressed={zoom() !== null || isSelectingZoom()}
                data-tooltip={
                  zoom()
                    ? "Reset zoom"
                    : isSelectingZoom()
                      ? "Cancel zoom selection"
                      : "Select zoom area"
                }
                style={{ height: "32px" }}
              >
                <MenuIcon
                  icon={zoom() ? "lucide:zoom-out" : "lucide:scan-search"}
                />
              </button>
              <button
                class="icon-button"
                onClick={() => toggleDrawing("pen")}
                aria-label="Draw"
                aria-pressed={drawingTool() === "pen"}
                data-tooltip={
                  drawingTool() === "pen"
                    ? "Turn drawing off"
                    : "Turn drawing on"
                }
                style={{ height: "32px" }}
              >
                <MenuIcon icon="lucide:pencil" />
              </button>
              <input
                aria-label="Pen color"
                title="Pen color"
                type="color"
                value={penColor()}
                onInput={(event) => setPenColor(event.currentTarget.value)}
                style={{ width: "32px", height: "32px", padding: "0" }}
              />
              <button
                class="icon-button"
                onClick={() => toggleDrawing("eraser")}
                aria-label="Erase"
                aria-pressed={drawingTool() === "eraser"}
                data-tooltip={
                  drawingTool() === "eraser"
                    ? "Turn eraser off"
                    : "Turn eraser on"
                }
                style={{ height: "32px" }}
              >
                <MenuIcon icon="lucide:eraser" />
              </button>
              <button
                class="icon-button"
                onClick={toggleDrawingsVisibility}
                aria-label={
                  drawingsHidden() ? "Show drawings" : "Hide drawings"
                }
                aria-pressed={drawingsHidden()}
                data-tooltip={
                  drawingsHidden() ? "Show drawings" : "Hide drawings"
                }
                style={{ height: "32px" }}
              >
                <MenuIcon
                  icon={drawingsHidden() ? "lucide:eye" : "lucide:eye-off"}
                />
              </button>
              <button
                class="icon-button"
                onClick={undoDrawing}
                aria-label="Undo drawing"
                data-tooltip="Undo drawing"
                disabled={drawingsForPage(currentPage()).length === 0}
                style={{ height: "32px" }}
              >
                <MenuIcon icon="lucide:undo-2" />
              </button>
              <button
                class="icon-button"
                onClick={redoDrawing}
                aria-label="Redo drawing"
                data-tooltip="Redo drawing"
                disabled={
                  redoStrokes().at(-1)?.page !== drawingPage(currentPage())
                }
                style={{ height: "32px" }}
              >
                <MenuIcon icon="lucide:redo-2" />
              </button>
              <button
                class="icon-button"
                onClick={clearDrawings}
                aria-label="Clear drawings"
                data-tooltip="Clear drawings"
                disabled={drawingsForPage(currentPage()).length === 0}
                style={{ height: "32px" }}
              >
                <MenuIcon icon="lucide:trash-2" />
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
              <button
                class="icon-button"
                onClick={openOverview}
                aria-label="Open slide overview"
                data-tooltip="Open slide overview"
                disabled={!pdfDocument()}
                style={{ height: "32px" }}
              >
                <MenuIcon icon="lucide:grid-2x2" />
              </button>
              <button
                class="icon-button"
                onClick={openSearch}
                aria-label="Search slides"
                data-tooltip="Search slides"
                disabled={!pdfDocument()}
                style={{ height: "32px" }}
              >
                <MenuIcon icon="lucide:search" />
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
          <Show when={pdfDocument()}>
            {(document) => (
              <SlideOverviewDialog
                document={document()}
                metadata={metadata()!}
                currentPage={completedSlidePage(metadata()!, currentPage())}
                setDialog={(dialog) => {
                  overviewDialog = dialog;
                }}
                onConfirm={confirmOverview}
              />
            )}
          </Show>
          <Show when={pdfDocument()}>
            {(document) => (
              <SlideSearchDialog
                document={document()}
                metadata={metadata()!}
                slides={searchableSlides()}
                loading={searchableSlides.loading}
                error={searchableSlides.error}
                selectedPage={searchPage()}
                setDialog={(dialog) => {
                  searchDialog = dialog;
                }}
                setInput={(input) => {
                  searchInput = input;
                }}
                onSelect={setSearchPage}
                onConfirm={confirmSearch}
              />
            )}
          </Show>
        </div>
      </Show>
    </Show>
  );
};

export default App;
