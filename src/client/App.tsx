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
import { addCollection, Icon } from "@iconify-icon/solid";
import { icons as lucideIcons } from "@iconify-json/lucide";
import { parseMetadata } from "./types/metadata";
import {
  adjacentVisiblePage,
  hashForPage,
  horizontalSwipeDirection,
  jumpVisiblePages,
  pageFromHash,
} from "./navigation";
import { actionForKey, isCharacterShortcut } from "./keyboard";
import type {
  DrawingStroke,
  SlidePoint,
  SlidePointer,
  SlideRect,
} from "./drawing";
import {
  adjacentLogicalSlidePage,
  blankScreenFromParam,
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
} from "./presentation";
import { createPresentationSync } from "./presentationSync";
import {
  getDocument,
  GlobalWorkerOptions,
  type PDFDocumentLoadingTask,
} from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { PdfSlide } from "./PdfSlide";
import { PageJumpDialog } from "./PageJumpDialog";
import { ShortcutDialog } from "./ShortcutDialog";
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

const wallClockFormatter = new Intl.DateTimeFormat(undefined, {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

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
      <MenuIcon icon="lucide:monitor-x" />
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
      <MenuIcon icon="lucide:sun" />
    </button>
  </>
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
    blankScreenFromParam(urlParams.get("blank")),
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
  const [characterShortcutsEnabled, setCharacterShortcutsEnabled] =
    createSignal(true);
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
  let pageJumpDialog!: HTMLDialogElement;
  let timingDialog!: HTMLDialogElement;
  let pageJumpInput!: HTMLInputElement;
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
  const [isFullscreen, setIsFullscreen] = createSignal(
    document.fullscreenElement !== null,
  );
  const [isCursorVisible, setIsCursorVisible] = createSignal(true);
  let cursorHideTimeout: number;
  let pointerHideTimeout: number;
  let wheelEndTimeout: number;
  let wheelHandled = false;
  let stageSwipeStart:
    { pointerId: number; clientX: number; clientY: number } | undefined;

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

  const showCursor = () => {
    setIsCursorVisible(true);
    window.clearTimeout(cursorHideTimeout);
    cursorHideTimeout = window.setTimeout(
      () => setIsCursorVisible(false),
      3000,
    );
  };

  const syncFullscreen = () =>
    setIsFullscreen(document.fullscreenElement !== null);

  const toggleFullScreen = async () => {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen();
    } else {
      await document.exitFullscreen();
    }
  };

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
    setCurrentPage(previousPage());
  };

  const goNextPage = () => {
    if (!metadata()) return;
    setCurrentPage(nextPage());
  };
  const openPageJump = () => {
    pageJumpInput.valueAsNumber = currentPage();
    pageJumpDialog.showModal();
    pageJumpInput.select();
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
    if (!characterShortcutsEnabled() && isCharacterShortcut(event)) return;

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
    if (
      (action === "undo-drawing" || action === "redo-drawing") &&
      drawingTool() === "none"
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
      case "previous-ten":
        setCurrentPage(jumpVisiblePages(metadata()!, currentPage(), -1));
        break;
      case "next-ten":
        setCurrentPage(jumpVisiblePages(metadata()!, currentPage(), 1));
        break;
      case "previous-slide":
        setCurrentPage(
          adjacentLogicalSlidePage(metadata()!, currentPage(), -1),
        );
        break;
      case "next-slide":
        setCurrentPage(adjacentLogicalSlidePage(metadata()!, currentPage(), 1));
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
      case "next-physical":
        setCurrentPage(Math.min(metadata()!.pageCount, currentPage() + 1));
        break;
      case "previous-physical":
        setCurrentPage(Math.max(1, currentPage() - 1));
        break;
      case "blackout":
        toggleBlankScreen("black");
        break;
      case "whiteout":
        toggleBlankScreen("white");
        break;
      case "fullscreen":
        void toggleFullScreen();
        break;
      case "toggle-freeze":
        toggleFreeze();
        break;
      case "go-to-page":
        openPageJump();
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
          setIsCurrentSlideMaximized(false);
        });
        break;
    }
  };

  const handleStageWheel = (event: WheelEvent) => {
    if (
      !(event.target instanceof Element) ||
      !event.target.closest(".slide-container") ||
      event.deltaY === 0 ||
      Math.abs(event.deltaY) <= Math.abs(event.deltaX)
    ) {
      return;
    }
    event.preventDefault();
    window.clearTimeout(wheelEndTimeout);
    wheelEndTimeout = window.setTimeout(() => {
      wheelHandled = false;
    }, 150);
    if (wheelHandled) return;
    wheelHandled = true;
    if (event.deltaY > 0) goNextPage();
    else goPreviousPage();
  };

  const handleStagePointerDown = (event: PointerEvent) => {
    if (
      event.pointerType !== "touch" ||
      !event.isPrimary ||
      !(event.target instanceof Element) ||
      !event.target.closest(".slide-container")
    ) {
      return;
    }
    stageSwipeStart = {
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
    };
  };

  createEffect(syncPageFromHash);
  const handleStagePointerUp = (event: PointerEvent) => {
    const start = stageSwipeStart;
    if (!start || event.pointerId !== start.pointerId) return;
    stageSwipeStart = undefined;
    const stage =
      event.target instanceof Element
        ? event.target.closest(".slide-container")
        : null;
    if (!(stage instanceof HTMLElement)) return;
    const direction = horizontalSwipeDirection(
      event.clientX - start.clientX,
      event.clientY - start.clientY,
      stage.clientWidth,
    );
    if (direction === undefined) return;
    event.preventDefault();
    if (direction === 1) goNextPage();
    else goPreviousPage();
  };

  createEffect(() => {
    const page = currentPage();
    if (page !== getPageFromHash()) {
      window.location.hash = hashForPage(page, metadata());
    }
  });

  createEffect(
    on(
      currentPage,
      (page, previousPage) => {
        if (isPresenterMode) endDrawing(false);
        setZoom(null);
        setIsSelectingZoom(false);
        const deck = metadata();
        if (
          previousPage !== undefined &&
          drawingPage(page) !== drawingPage(previousPage)
        ) {
          setRedoStrokes([]);
        }
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
        setPointer(null);
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

  createEffect(
    on(metadata, (deck) => {
      if (!isPresenterMode || !deck || timerStartedAt() !== undefined) return;
      const now = Date.now();
      const startAt = presentationStartAt(deck, now);
      setCurrentTime(now);
      setScheduledStartAt(startAt);
      if (startAt !== undefined && startAt <= now) startTimer(now - startAt);
    }),
  );

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
    if (!isPresenterMode || !deck || timerStartedAt() !== undefined) return;
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
    if (!isPresenterMode) {
      const listener = { signal: lifecycle.signal };
      window.addEventListener("wheel", handleStageWheel, {
        ...listener,
        passive: false,
      });
      window.addEventListener("pointerdown", handleStagePointerDown, listener);
      window.addEventListener("pointerup", handleStagePointerUp, listener);
      window.addEventListener(
        "pointercancel",
        () => {
          stageSwipeStart = undefined;
        },
        listener,
      );
    }
    const cancelActiveDrawing = () => {
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
    if (isPresenterMode) {
      window.addEventListener("pagehide", cancelActiveDrawing, {
        signal: lifecycle.signal,
      });
    }
    document.addEventListener("fullscreenchange", syncFullscreen);
    document.addEventListener("visibilitychange", keepScreenAwake);
    if (!isPresenterMode) {
      window.addEventListener("mousemove", showCursor);
      showCursor();
    }
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
      if (!isPresenterMode) {
        window.removeEventListener("mousemove", showCursor);
      }
      document.removeEventListener("fullscreenchange", syncFullscreen);
      document.removeEventListener("visibilitychange", keepScreenAwake);
      releaseWakeLock(wakeLock());
      window.clearTimeout(cursorHideTimeout);
      window.clearTimeout(pointerHideTimeout);
      window.clearTimeout(wheelEndTimeout);
    });
  });

  onCleanup(() => {
    void pdfLoadingTask?.destroy();
  });

  const openPresenterWindow = () => {
    const url = new URL(window.location.href);
    url.search = "";
    url.searchParams.set("mode", "presenter");
    if (blankScreen() !== "none") {
      url.searchParams.set("blank", blankScreen());
    }
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
              classList={{ "cursor-hidden": !isCursorVisible() }}
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
              role="group"
              aria-label="Stage controls"
              style={{
                position: "fixed",
                bottom: "20px",
                left: "50%",
                transform: "translateX(-50%)",
                width: "max-content",
                "max-width": "calc(100vw - 20px)",
                "box-sizing": "border-box",
                padding: "10px",
                "border-radius": "5px",
                display: "flex",
                "flex-direction": "column",
                gap: "5px",
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
                    : "Loading slides"}
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
                  aria-label={
                    isFullscreen() ? "Exit fullscreen" : "Enter fullscreen"
                  }
                  aria-pressed={isFullscreen()}
                  disabled={!document.fullscreenEnabled}
                  style={{ height: "100%" }}
                >
                  <MenuIcon
                    icon={
                      isFullscreen() ? "lucide:minimize" : "lucide:maximize"
                    }
                  />
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
                  onClick={() => shortcutDialog.showModal()}
                  aria-label="Show keyboard shortcuts"
                  data-tooltip="Show keyboard shortcuts"
                  style={{ height: "100%" }}
                >
                  <MenuIcon icon="lucide:circle-help" />
                </button>
              </div>
            </div>
            <PageJumpDialog
              pageCount={metadata()?.pageCount ?? 0}
              setDialog={(dialog) => {
                pageJumpDialog = dialog;
              }}
              setInput={(input) => {
                pageJumpInput = input;
              }}
              onConfirm={setCurrentPage}
            />
            <ShortcutDialog
              characterShortcutsEnabled={characterShortcutsEnabled()}
              onCharacterShortcutsEnabledChange={setCharacterShortcutsEnabled}
              setDialog={setShortcutDialog}
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
                    <Show
                      when={previewPage()}
                      fallback={
                        <p role="status" lang="en">
                          End of presentation
                        </p>
                      }
                    >
                      {(page) => (
                        <PdfSlide
                          document={document()}
                          page={page()}
                          label={`Next slide: ${pageLabel(metadata()!, page())}`}
                          opacity={0.5}
                          drawings={visibleDrawingsForPage(page())}
                          onNavigate={setCurrentPage}
                        />
                      )}
                    </Show>
                  </div>
                </>
              )}
            </Show>
          </div>
          <section
            class="speaker-notes"
            aria-label="Speaker notes"
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
              <p style={{ margin: "0", color: "#aaa", "font-style": "italic" }}>
                No speaker notes for this slide.
              </p>
            )}
          </section>
          <div
            class="presenter-footer"
            style={{
              display: "flex",
              "flex-wrap": "wrap",
              "justify-content": "space-between",
              "align-items": "stretch",
              gap: "8px",
              padding: "10px",
              "background-color": "#222",
              "min-height": "32px",
              "flex-shrink": "0",
            }}
          >
            <section
              class="presenter-control-scope"
              aria-labelledby="presenter-view-controls"
            >
              <h2 id="presenter-view-controls">Presenter View</h2>
              <fieldset class="presenter-control-group">
                <legend>Timing</legend>
                <div class="presenter-control-row">
                  <Icon
                    aria-hidden="true"
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
                        style={{ "font-size": "24px" }}
                      >
                        {formatElapsedTime(elapsedSeconds())}
                      </div>
                    }
                  >
                    {(startAt) => (
                      <div
                        role="timer"
                        aria-label="Time until scheduled start"
                        style={{ "font-size": "24px" }}
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
                      timerStartedAt() !== undefined
                        ? remainingTime()
                        : undefined
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
                  <time
                    aria-label="Current time"
                    dateTime={new Date(currentTime()).toISOString()}
                    style={{ "font-size": "16px" }}
                  >
                    {wallClockFormatter.format(currentTime())}
                  </time>
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
                        timerStartedAt() === null
                          ? "Resume timer"
                          : "Pause timer"
                      }
                      style={{ height: "32px" }}
                    >
                      <MenuIcon
                        icon={
                          timerStartedAt() === null
                            ? "lucide:play"
                            : "lucide:pause"
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
                </div>
              </fieldset>
              <fieldset class="presenter-control-group">
                <legend>View</legend>
                <div class="presenter-control-row">
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
                </div>
              </fieldset>
            </section>
            <section
              class="presenter-control-scope"
              aria-labelledby="stage-controls"
            >
              <h2 id="stage-controls">Stage</h2>
              <fieldset class="presenter-control-group">
                <legend>Auto advance</legend>
                <div class="presenter-control-row">
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
                </div>
              </fieldset>
              <fieldset class="presenter-control-group">
                <legend>Screen</legend>
                <div class="presenter-control-row">
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
                </div>
              </fieldset>
              <fieldset class="presenter-control-group">
                <legend>Pointer and zoom</legend>
                <div class="presenter-control-row">
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
                </div>
              </fieldset>
              <fieldset class="presenter-control-group">
                <legend>Drawings</legend>
                <div class="presenter-control-row">
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
                </div>
              </fieldset>
              <fieldset class="presenter-control-group presenter-navigation-group">
                <legend>Navigation</legend>
                <div class="presenter-control-row">
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
                    class="presenter-page-navigation"
                    style={{
                      display: "flex",
                      gap: "10px",
                      "align-items": "center",
                    }}
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
                        : "Loading slides"}
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
              </fieldset>
            </section>
          </div>
          <PageJumpDialog
            pageCount={metadata()?.pageCount ?? 0}
            setDialog={(dialog) => {
              pageJumpDialog = dialog;
            }}
            setInput={(input) => {
              pageJumpInput = input;
            }}
            onConfirm={setCurrentPage}
          />
          <ShortcutDialog
            characterShortcutsEnabled={characterShortcutsEnabled()}
            onCharacterShortcutsEnabledChange={setCharacterShortcutsEnabled}
            setDialog={setShortcutDialog}
          />
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
