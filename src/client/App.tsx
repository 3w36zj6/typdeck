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
  untrack,
} from "solid-js";
import { parseMetadata } from "./types/metadata";
import { addCollection, Icon } from "@iconify-icon/solid";
import { icons as lucideIcons } from "@iconify-json/lucide";
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
  type SlideTimingState,
  timingBreakdownRows,
  updateSlideTiming,
  type BlankScreen,
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
import DOMPurify from "dompurify";
import { marked } from "marked";

GlobalWorkerOptions.workerSrc = pdfWorker;
addCollection(lucideIcons);

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

const BlankScreenButtons = (props: {
  blankScreen: BlankScreen;
  height: string;
  onToggle: (color: Exclude<BlankScreen, "none">) => void;
}) => (
  <>
    <button
      class="icon-button"
      onClick={() => props.onToggle("black")}
      aria-label="Blackout"
      aria-pressed={props.blankScreen === "black"}
      data-tooltip={
        props.blankScreen === "black" ? "Turn blackout off" : "Turn blackout on"
      }
      style={{ height: props.height }}
    >
      <MenuIcon
        icon={
          props.blankScreen === "black" ? "lucide:monitor" : "lucide:monitor-x"
        }
      />
    </button>
    <button
      class="icon-button"
      onClick={() => props.onToggle("white")}
      aria-label="Whiteout"
      aria-pressed={props.blankScreen === "white"}
      data-tooltip={
        props.blankScreen === "white" ? "Turn whiteout off" : "Turn whiteout on"
      }
      style={{ height: props.height }}
    >
      <MenuIcon
        icon={props.blankScreen === "white" ? "lucide:monitor" : "lucide:sun"}
      />
    </button>
  </>
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
          <kbd>Shift + Backspace / Space</kbd>
        </dt>
        <dd>Back / forward in slide history</dd>
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
          <kbd>M / Shift+M</kbd>
        </dt>
        <dd>Bookmark / return to the bookmarked or saved slide</dd>
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
          <kbd>W</kbd>
        </dt>
        <dd>Toggle whiteout</dd>
        <dt>
          <kbd>Shift+F</kbd>
        </dt>
        <dd>Freeze or unfreeze the Stage (Presenter View)</dd>
        <dt>
          <kbd>Shift+A</kbd>
        </dt>
        <dd>Maximize or restore the current slide (Presenter View)</dd>
        <dt>
          <kbd>1 / 2 / 3 / 4 / 5</kbd>
        </dt>
        <dd>Normal / laser / pen / eraser / spotlight mode (Presenter View)</dd>
        <dt>
          <kbd>+ / −</kbd>
        </dt>
        <dd>Resize the active input tool (Presenter View)</dd>
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
        <dd>Clear blanking, freeze, zoom, and the active tool</dd>
      </dl>
      <form method="dialog">
        <button>Close</button>
      </form>
    </div>
  </dialog>
);

const TimingDialog = (props: {
  rows: { label: string; level: number; milliseconds: number }[];
  totalMilliseconds: number;
  setDialog: (dialog: HTMLDialogElement) => void;
}) => (
  <dialog
    ref={props.setDialog}
    aria-labelledby="timing-heading"
    class="shortcut-dialog timing-dialog"
    onClick={(event) => {
      if (event.target === event.currentTarget) event.currentTarget.close();
    }}
  >
    <div>
      <h2 id="timing-heading">Timing breakdown</h2>
      <Show when={props.rows.length > 0} fallback={<p>No timing data yet.</p>}>
        <table>
          <thead>
            <tr>
              <th scope="col">Slide</th>
              <th scope="col">Time</th>
            </tr>
          </thead>
          <tbody>
            <For each={props.rows}>
              {(row) => (
                <tr>
                  <th
                    scope="row"
                    aria-label={`Level ${row.level}: ${row.label}`}
                    style={{ "padding-left": `${(row.level - 1) * 1.5}rem` }}
                  >
                    {row.label}
                  </th>
                  <td>
                    {formatElapsedTime(Math.floor(row.milliseconds / 1000))}
                  </td>
                </tr>
              )}
            </For>
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">Total</th>
              <td>
                {formatElapsedTime(Math.floor(props.totalMilliseconds / 1000))}
              </td>
            </tr>
          </tfoot>
        </table>
      </Show>
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
    blankScreen,
    setBlankScreen,
    bookmarkPage,
    setBookmarkPage,
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
    savePersistentState,
  } = createPresentationSync(
    pageFromHash(window.location.hash),
    urlParams.has("blackout") ? "black" : "none",
    () => metadata(),
  );
  const [pointerMode, setPointerMode] = createSignal<
    "none" | SlidePointer["kind"]
  >("none");
  const [drawingTool, setDrawingTool] = createSignal<
    "none" | DrawingStroke["kind"]
  >("none");
  const [isSelectingZoom, setIsSelectingZoom] = createSignal(false);
  const [penColor, setPenColor] = createSignal("#ff2222");
  const [inputScales, setInputScales] = createSignal<
    Record<SlidePointer["kind"] | DrawingStroke["kind"], number>
  >({ laser: 1, spotlight: 1, pen: 1, eraser: 1 });
  const [redoStrokes, setRedoStrokes] = createSignal<DrawingStroke[]>([]);
  const [currentTime, setCurrentTime] = createSignal(Date.now());
  const [timerTime, setTimerTime] = createSignal(performance.now());
  const [elapsedMilliseconds, setElapsedMilliseconds] = createSignal(0);
  const [timerStartedAt, setTimerStartedAt] = createSignal<number | null>();
  const [slideTiming, setSlideTiming] = createSignal<SlideTimingState>({
    page: currentPage(),
    elapsedMilliseconds: 0,
    durations: {},
  });
  const [scheduledStartAt, setScheduledStartAt] = createSignal<number>();
  const [autoAdvanceSeconds, setAutoAdvanceSeconds] = createSignal(10);
  const [autoAdvanceState, setAutoAdvanceState] = createSignal<
    "stopped" | "running" | "paused"
  >("stopped");
  const [autoAdvanceDeadline, setAutoAdvanceDeadline] = createSignal<number>();
  const [autoAdvanceRemaining, setAutoAdvanceRemaining] = createSignal(10_000);
  const currentElapsedMilliseconds = (now = timerTime()) => {
    const startedAt = timerStartedAt();
    return (
      elapsedMilliseconds() +
      (typeof startedAt === "number" ? Math.max(0, now - startedAt) : 0)
    );
  };
  const elapsedSeconds = createMemo(() =>
    Math.floor(currentElapsedMilliseconds() / 1000),
  );
  const timingSnapshot = createMemo(() => {
    const deck = metadata();
    return deck
      ? updateSlideTiming(
          deck,
          slideTiming(),
          currentPage(),
          currentElapsedMilliseconds(),
        )
      : undefined;
  });
  const timingRows = createMemo(() => {
    const deck = metadata();
    const snapshot = timingSnapshot();
    return deck && snapshot
      ? timingBreakdownRows(deck, snapshot.durations)
      : [];
  });
  const timingTotalMilliseconds = createMemo(() =>
    Object.values(timingSnapshot()?.durations ?? {}).reduce(
      (total, duration) => total + duration,
      0,
    ),
  );
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
  let timingDialog!: HTMLDialogElement;
  let searchInput!: HTMLInputElement;
  const [searchPage, setSearchPage] = createSignal(1);
  const [isCurrentSlideMaximized, setIsCurrentSlideMaximized] =
    createSignal(false);
  const toggleCurrentSlideSize = () =>
    setIsCurrentSlideMaximized((maximized) => !maximized);
  const currentInput = createMemo(() => {
    const pointerKind = pointerMode();
    const drawingKind = drawingTool();
    const kind =
      pointerKind !== "none"
        ? pointerKind
        : drawingKind !== "none"
          ? drawingKind
          : undefined;
    return kind ? { kind, size: inputScales()[kind] } : undefined;
  });
  const resizeCurrentMode = (change: -0.25 | 0.25) => {
    const input = currentInput();
    if (!input) return;
    const size = Math.min(3, Math.max(0.5, input.size + change));
    if (size === input.size) return;
    setInputScales((sizes) => ({ ...sizes, [input.kind]: size }));
    setPointer((pointer) =>
      pointer?.kind === input.kind ? { ...pointer, size } : pointer,
    );
  };
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
    const elapsed = currentElapsedMilliseconds(now);
    batch(() => {
      setTimerTime(now);
      setElapsedMilliseconds(elapsed);
      const deck = metadata();
      if (deck) {
        setSlideTiming((state) =>
          updateSlideTiming(deck, state, currentPage(), elapsed),
        );
      }
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
      setSlideTiming({
        page: currentPage(),
        elapsedMilliseconds: 0,
        durations: {},
      });
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

  const toggleBlankScreen = (color: Exclude<BlankScreen, "none">) =>
    setBlankScreen((value) => (value === color ? "none" : color));

  const stagePage = () => frozenPage() ?? currentPage();

  const toggleFreeze = () =>
    setFrozenPage((page) => (page === null ? currentPage() : null));

  const bookmarkCurrentSlide = () => {
    const deck = metadata();
    if (deck) setBookmarkPage(logicalSlideStartPage(deck, currentPage()));
  };

  const bookmarkDestination = () => {
    const deck = metadata();
    return bookmarkPage() ?? (deck ? savedSlidePage(deck) : undefined);
  };

  const goToBookmark = () => {
    const page = bookmarkDestination();
    if (page !== undefined) setCurrentPage(page);
  };

  const isCurrentSlideBookmarked = () => {
    const deck = metadata();
    return (
      deck !== undefined &&
      bookmarkPage() === logicalSlideStartPage(deck, currentPage())
    );
  };

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
    setPointer({
      ...point,
      kind,
      page: currentPage(),
      size: inputScales()[kind],
    });
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
      size: inputScales()[kind],
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

  const syncPageFromHash = () => {
    if (metadata()) setCurrentPage(getPageFromHash());
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
          action === "toggle-current-slide-size" ||
          action === "input-larger" ||
          action === "input-smaller" ||
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
      case "history-back":
        window.history.back();
        break;
      case "history-forward":
        window.history.forward();
        break;
      case "first":
        setCurrentPage(adjacentVisiblePage(metadata()!, 0, 1));
        break;
      case "last":
        setCurrentPage(endSlidePage(metadata()!));
        break;
      case "bookmark":
        bookmarkCurrentSlide();
        break;
      case "saved":
        goToBookmark();
        break;
      case "blackout":
        toggleBlankScreen("black");
        break;
      case "whiteout":
        toggleBlankScreen("white");
        break;
      case "toggle-freeze":
        toggleFreeze();
        break;
      case "toggle-current-slide-size":
        toggleCurrentSlideSize();
        break;
      case "input-larger":
        resizeCurrentMode(0.25);
        break;
      case "input-smaller":
        resizeCurrentMode(-0.25);
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
          setBlankScreen("none");
          setFrozenPage(null);
          setZoom(null);
          selectInputMode("normal");
        });
        break;
    }
  };

  createEffect(syncPageFromHash);

  createEffect(() => {
    const page = currentPage();
    if (page !== getPageFromHash()) {
      window.location.hash = hashForPage(page, metadata());
    }
  });

  createEffect(
    on(
      currentPage,
      (page) => {
        if (isPresenterMode) endDrawing(false);
        setZoom(null);
        setIsSelectingZoom(false);
        const deck = metadata();
        if (deck) {
          setSlideTiming((state) =>
            updateSlideTiming(
              deck,
              state,
              page,
              currentElapsedMilliseconds(performance.now()),
            ),
          );
        }
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

  const currentSpeakerNote = createMemo(
    () => metadata()?.slides?.[`${currentPage()}`]?.speakerNotes,
  );
  const speakerNoteContent = createMemo(() => {
    const note = currentSpeakerNote();
    if (!note || metadata()?.disableMarkdown === true) return;
    const content = DOMPurify.sanitize(marked.parse(note, { async: false }), {
      USE_PROFILES: { html: true },
      SANITIZE_NAMED_PROPS: true,
      FORBID_ATTR: ["style"],
      FORBID_TAGS: ["style"],
      RETURN_DOM_FRAGMENT: true,
    });
    for (const link of content.querySelectorAll("a")) {
      link.target = "_blank";
      link.relList.add("noopener", "noreferrer");
    }
    return content;
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
    const [wakeLock, setWakeLock] = createSignal<WakeLockSentinel>();
    const [acquiringWakeLock, setAcquiringWakeLock] = createSignal(false);
    const lifecycle = new AbortController();
    const saveBeforeUnload = () => {
      endDrawing(false);
      savePersistentState();
    };
    const releaseWakeLock = (lock: WakeLockSentinel | undefined) => {
      if (lock) void lock.release().then(undefined, () => undefined);
    };
    const keepScreenAwake = () => {
      if (
        !metadata() ||
        !pdfDocument() ||
        !("wakeLock" in navigator) ||
        document.visibilityState !== "visible" ||
        acquiringWakeLock() ||
        wakeLock()?.released === false
      ) {
        return;
      }
      setAcquiringWakeLock(true);
      void navigator.wakeLock.request().then(
        (lock) => {
          if (lifecycle.signal.aborted) releaseWakeLock(lock);
          else setWakeLock(lock);
          setAcquiringWakeLock(false);
        },
        () => setAcquiringWakeLock(false),
      );
    };
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("hashchange", syncPageFromHash);
    window.addEventListener("pagehide", saveBeforeUnload);
    window.addEventListener("mousemove", showMenu);
    window.addEventListener("touchstart", showMenu);
    document.addEventListener("visibilitychange", keepScreenAwake);
    createEffect(() => {
      if (metadata() && pdfDocument()) untrack(keepScreenAwake);
    });

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
      lifecycle.abort();
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("hashchange", syncPageFromHash);
      window.removeEventListener("pagehide", saveBeforeUnload);
      window.removeEventListener("mousemove", showMenu);
      window.removeEventListener("touchstart", showMenu);
      document.removeEventListener("visibilitychange", keepScreenAwake);
      releaseWakeLock(wakeLock());
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
    if (blankScreen() === "black") url.searchParams.set("blackout", "1");
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
              inert={blankScreen() !== "none"}
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
            <Show when={blankScreen() !== "none"}>
              <div
                aria-hidden="true"
                data-blank-screen={blankScreen()}
                style={{
                  position: "fixed",
                  inset: "0",
                  background: blankScreen(),
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
                <BlankScreenButtons
                  blankScreen={blankScreen()}
                  height="100%"
                  onToggle={toggleBlankScreen}
                />
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
                      width: isCurrentSlideMaximized() ? "100%" : "49%",
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
                      display: isCurrentSlideMaximized() ? "none" : "flex",
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
              display: isCurrentSlideMaximized() ? "none" : undefined,
              padding: "10px",
              "border-top": "1px solid #333",
              "background-color": "#111",
              height: "200px",
              "overflow-y": "auto",
              "flex-shrink": "0",
            }}
          >
            {currentSpeakerNote() ? (
              metadata()?.disableMarkdown === true ? (
                <p
                  lang={metadata()?.language}
                  style={{
                    margin: "0",
                    "white-space": "pre-wrap",
                    "word-break": "break-word",
                  }}
                >
                  {currentSpeakerNote()}
                </p>
              ) : (
                <div
                  class="speaker-note-content"
                  lang={metadata()?.language}
                  style={{ "word-break": "break-word" }}
                >
                  {speakerNoteContent()}
                </div>
              )
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
              <button
                class="icon-button"
                onClick={() => timingDialog.showModal()}
                aria-label="Show timing breakdown"
                data-tooltip="Show timing breakdown"
                style={{ height: "32px" }}
              >
                <MenuIcon icon="lucide:chart-no-axes-column" />
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
              <BlankScreenButtons
                blankScreen={blankScreen()}
                height="32px"
                onToggle={toggleBlankScreen}
              />
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
                onClick={toggleCurrentSlideSize}
                aria-label={
                  isCurrentSlideMaximized()
                    ? "Restore current slide size"
                    : "Maximize current slide"
                }
                aria-pressed={isCurrentSlideMaximized()}
                data-tooltip={
                  isCurrentSlideMaximized()
                    ? "Restore current slide size"
                    : "Maximize current slide"
                }
                style={{ height: "32px" }}
              >
                <MenuIcon
                  icon={
                    isCurrentSlideMaximized()
                      ? "lucide:minimize-2"
                      : "lucide:maximize-2"
                  }
                />
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
              <div
                role="group"
                aria-label="Input tool size"
                style={{
                  display: "flex",
                  gap: "4px",
                  "align-items": "center",
                }}
              >
                <button
                  class="icon-button"
                  onClick={() => resizeCurrentMode(-0.25)}
                  aria-label="Decrease input tool size"
                  data-tooltip="Decrease input tool size"
                  disabled={(currentInput()?.size ?? 0.5) <= 0.5}
                  style={{ height: "32px" }}
                >
                  <MenuIcon icon="lucide:minus" />
                </button>
                <output
                  aria-live="polite"
                  style={{ "min-width": "4ch", "text-align": "center" }}
                >
                  {currentInput()?.size ?? "—"}
                  {currentInput() && "×"}
                </output>
                <button
                  class="icon-button"
                  onClick={() => resizeCurrentMode(0.25)}
                  aria-label="Increase input tool size"
                  data-tooltip="Increase input tool size"
                  disabled={(currentInput()?.size ?? 3) >= 3}
                  style={{ height: "32px" }}
                >
                  <MenuIcon icon="lucide:plus" />
                </button>
              </div>
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
              <button
                class="icon-button"
                onClick={bookmarkCurrentSlide}
                aria-label="Bookmark current slide"
                aria-pressed={isCurrentSlideBookmarked()}
                data-tooltip="Bookmark current slide"
                disabled={!metadata()}
                style={{ height: "32px" }}
              >
                <MenuIcon icon="lucide:bookmark-plus" />
              </button>
              <button
                class="icon-button"
                onClick={goToBookmark}
                aria-label="Go to bookmarked or saved slide"
                data-tooltip="Go to bookmarked or saved slide"
                disabled={bookmarkDestination() === undefined}
                style={{ height: "32px" }}
              >
                <MenuIcon icon="lucide:bookmark-check" />
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
          <TimingDialog
            rows={timingRows()}
            totalMilliseconds={timingTotalMilliseconds()}
            setDialog={(dialog) => {
              timingDialog = dialog;
            }}
          />
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
