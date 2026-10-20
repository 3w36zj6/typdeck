import {
  type Accessor,
  batch,
  createEffect,
  createMemo,
  createRenderEffect,
  createSignal,
  on,
  onCleanup,
  untrack,
} from "solid-js";
import * as v from "valibot";
import type { DrawingStroke, SlidePointer, SlideZoom } from "./drawing";
import type { BlankScreen } from "./presentation";
import { metadataIdentity, type Metadata } from "./types/metadata";

const PointSchema = v.object({
  x: v.pipe(v.number(), v.minValue(0), v.maxValue(1)),
  y: v.pipe(v.number(), v.minValue(0), v.maxValue(1)),
});
const ToolSizeSchema = v.pipe(v.number(), v.minValue(0.5), v.maxValue(3));

const PointerSchema = v.nullable(
  v.object({
    kind: v.picklist(["laser", "spotlight"]),
    page: v.pipe(v.number(), v.integer(), v.minValue(1)),
    size: ToolSizeSchema,
    x: v.pipe(v.number(), v.minValue(0), v.maxValue(1)),
    y: v.pipe(v.number(), v.minValue(0), v.maxValue(1)),
  }),
);
const ZoomSchema = v.nullable(
  v.pipe(
    v.object({
      page: v.pipe(v.number(), v.integer(), v.minValue(1)),
      x: v.pipe(v.number(), v.minValue(0), v.maxValue(1)),
      y: v.pipe(v.number(), v.minValue(0), v.maxValue(1)),
      width: v.pipe(v.number(), v.minValue(0), v.maxValue(1)),
      height: v.pipe(v.number(), v.minValue(0), v.maxValue(1)),
    }),
    v.check(
      ({ x, y, width, height }) =>
        width > 0 &&
        height > 0 &&
        x + width <= 1 + Number.EPSILON &&
        y + height <= 1 + Number.EPSILON,
      "Zoom rectangle must fit within the page",
    ),
  ),
);
const DrawingEntries = {
  page: v.pipe(v.number(), v.integer(), v.minValue(1)),
  points: v.pipe(v.array(PointSchema), v.minLength(2)),
  size: ToolSizeSchema,
};
const DrawingSchema = v.variant("kind", [
  v.object({
    kind: v.literal("pen"),
    color: v.pipe(v.string(), v.hexColor()),
    ...DrawingEntries,
  }),
  v.object({ kind: v.literal("eraser"), ...DrawingEntries }),
]);

const SlideStateSchema = v.object({
  blankScreen: v.picklist(["none", "black", "white"]),
  bookmarkPage: v.nullable(v.pipe(v.number(), v.integer(), v.minValue(1))),
  currentPage: v.pipe(v.number(), v.integer(), v.minValue(1)),
  drawings: v.array(DrawingSchema),
  drawingsHidden: v.boolean(),
  stageControlsHidden: v.boolean(),
  frozenPage: v.nullable(v.pipe(v.number(), v.integer(), v.minValue(1))),
  zoom: ZoomSchema,
});
const PersistentStateSchema = v.object({
  blankScreen: v.picklist(["none", "black", "white"]),
  bookmarkPage: v.nullable(v.pipe(v.number(), v.integer(), v.minValue(1))),
  drawings: v.array(DrawingSchema),
  drawingsHidden: v.boolean(),
  frozenPage: v.nullable(v.pipe(v.number(), v.integer(), v.minValue(1))),
});
const StoredStateSchema = v.object({
  deck: v.string(),
  state: PersistentStateSchema,
});
const TransientStateSchema = v.object({
  activeDrawing: v.nullable(DrawingSchema),
  pointer: PointerSchema,
});
const PresentationRoleSchema = v.picklist(["stage", "presenter"]);
const ChannelMessageSchema = v.variant("type", [
  v.object({
    deck: v.string(),
    type: v.literal("toggle-stage-controls"),
  }),
  v.object({
    deck: v.string(),
    requester: PresentationRoleSchema,
    type: v.literal("request-state"),
  }),
  v.object({
    deck: v.string(),
    state: TransientStateSchema,
    type: v.literal("transient-state"),
  }),
  v.object({
    deck: v.string(),
    type: v.literal("state"),
    state: SlideStateSchema,
  }),
]);

const samePointer = (left: SlidePointer | null, right: SlidePointer | null) =>
  left === right ||
  (left !== null &&
    right !== null &&
    left.kind === right.kind &&
    left.page === right.page &&
    left.size === right.size &&
    left.x === right.x &&
    left.y === right.y);

const sameZoom = (left: SlideZoom | null, right: SlideZoom | null) =>
  left === right ||
  (left !== null &&
    right !== null &&
    left.page === right.page &&
    left.x === right.x &&
    left.y === right.y &&
    left.width === right.width &&
    left.height === right.height);

const sameDrawing = (left: DrawingStroke | null, right: DrawingStroke | null) =>
  left === right ||
  (left !== null &&
    right !== null &&
    left.kind === right.kind &&
    (left.kind === "eraser" ||
      (right.kind === "pen" && left.color === right.color)) &&
    left.page === right.page &&
    left.size === right.size &&
    left.points.length === right.points.length &&
    left.points.every(
      (point, index) =>
        point.x === right.points[index]?.x &&
        point.y === right.points[index]?.y,
    ));

const sameDrawings = (left: DrawingStroke[], right: DrawingStroke[]) =>
  left === right ||
  (left.length === right.length &&
    left.every((stroke, index) => sameDrawing(stroke, right[index] ?? null)));

type SlideState = v.InferOutput<typeof SlideStateSchema>;
type PersistentState = v.InferOutput<typeof PersistentStateSchema>;
type TransientState = v.InferOutput<typeof TransientStateSchema>;
type PresentationRole = v.InferOutput<typeof PresentationRoleSchema>;

const fitsDeck = (state: PersistentState, pageCount: number) =>
  (state.bookmarkPage === null || state.bookmarkPage <= pageCount) &&
  state.drawings.every(({ page }) => page <= pageCount) &&
  (state.frozenPage === null || state.frozenPage <= pageCount);

const sameTransientState = (left: TransientState, right: TransientState) =>
  sameDrawing(left.activeDrawing, right.activeDrawing) &&
  samePointer(left.pointer, right.pointer);

export const shouldBroadcastState = (
  received: SlideState | undefined,
  current: SlideState,
) =>
  received === undefined ||
  received.blankScreen !== current.blankScreen ||
  received.bookmarkPage !== current.bookmarkPage ||
  received.currentPage !== current.currentPage ||
  !sameDrawings(received.drawings, current.drawings) ||
  received.drawingsHidden !== current.drawingsHidden ||
  received.stageControlsHidden !== current.stageControlsHidden ||
  received.frozenPage !== current.frozenPage ||
  !sameZoom(received.zoom, current.zoom);

export const createPresentationSync = (
  initialPage: number,
  initialBlankScreen: BlankScreen,
  role: PresentationRole,
  metadata: Accessor<Metadata | undefined>,
  onToggleStageControls: () => void,
) => {
  const [currentPage, setCurrentPage] = createSignal(initialPage);
  const [blankScreen, setBlankScreen] =
    createSignal<BlankScreen>(initialBlankScreen);
  const [bookmarkPage, setBookmarkPage] = createSignal<number | null>(null);
  const [activeDrawing, setActiveDrawing] = createSignal<DrawingStroke | null>(
    null,
    { equals: sameDrawing },
  );
  const [drawings, setDrawings] = createSignal<DrawingStroke[]>([], {
    equals: sameDrawings,
  });
  const [drawingsHidden, setDrawingsHidden] = createSignal(false);
  const [stageControlsHidden, setStageControlsHidden] = createSignal(false);
  const [frozenPage, setFrozenPage] = createSignal<number | null>(null);
  const [pointer, setPointer] = createSignal<SlidePointer | null>(null, {
    equals: samePointer,
  });
  const [zoom, setZoom] = createSignal<SlideZoom | null>(null, {
    equals: sameZoom,
  });
  const storageKey = `typdeck:${location.pathname}`;
  const channel = new BroadcastChannel(storageKey);
  const deckId = createMemo(() => {
    const deck = metadata();
    return deck && metadataIdentity(deck);
  });
  const [receivedState, setReceivedState] = createSignal<SlideState>();
  const [receivedTransientState, setReceivedTransientState] =
    createSignal<TransientState>();
  const [transientFrame, setTransientFrame] = createSignal<number>();

  const currentState = () => ({
    blankScreen: blankScreen(),
    bookmarkPage: bookmarkPage(),
    currentPage: currentPage(),
    drawings: drawings(),
    drawingsHidden: drawingsHidden(),
    stageControlsHidden: stageControlsHidden(),
    frozenPage: frozenPage(),
    zoom: zoom(),
  });
  const currentTransientState = () => ({
    activeDrawing: activeDrawing(),
    pointer: pointer(),
  });
  const transientState = createMemo(currentTransientState, undefined, {
    equals: sameTransientState,
  });
  const postState = () => {
    const id = deckId();
    if (!id) return;
    channel.postMessage({
      deck: id,
      type: "state",
      state: currentState(),
    });
  };
  const requestStageControlsToggle = () => {
    const id = deckId();
    if (!id) return;
    channel.postMessage({ deck: id, type: "toggle-stage-controls" });
  };
  const postTransientState = (state = currentTransientState()) => {
    const id = deckId();
    if (!id) return;
    channel.postMessage({
      deck: id,
      state,
      type: "transient-state",
    });
  };
  const savePersistentState = () => {
    const id = deckId();
    if (!id) return;
    try {
      sessionStorage.setItem(
        storageKey,
        JSON.stringify({
          deck: id,
          state: {
            blankScreen: blankScreen(),
            bookmarkPage: bookmarkPage(),
            drawings: drawings(),
            drawingsHidden: drawingsHidden(),
            frozenPage: frozenPage(),
          },
        }),
      );
    } catch {
      // Storage is optional; presentation controls must keep working without it.
    }
  };

  channel.onmessage = (event) => {
    const message = v.safeParse(ChannelMessageSchema, event.data);
    if (!message.success) return;
    const deck = metadata();
    if (!deck || message.output.deck !== deckId()) return;
    if (message.output.type === "toggle-stage-controls") {
      if (role === "stage") onToggleStageControls();
      return;
    }
    if (message.output.type === "request-state") {
      if (message.output.requester !== role) {
        postState();
        postTransientState();
      }
      return;
    }

    const pages = deck.pageCount;
    if (message.output.type === "transient-state") {
      const state = message.output.state;
      if (
        (state.activeDrawing !== null && state.activeDrawing.page > pages) ||
        (state.pointer !== null && state.pointer.page > pages)
      ) {
        return;
      }
      setReceivedTransientState(state);
      batch(() => {
        setActiveDrawing(state.activeDrawing);
        setPointer(state.pointer);
      });
      return;
    }

    const state = message.output.state;
    if (
      state.currentPage > pages ||
      !fitsDeck(state, pages) ||
      (state.zoom !== null && state.zoom.page > pages)
    ) {
      return;
    }

    setReceivedState(state);
    batch(() => {
      setCurrentPage(state.currentPage);
      setBlankScreen(state.blankScreen);
      setBookmarkPage(state.bookmarkPage);
      setDrawings(state.drawings);
      setDrawingsHidden(state.drawingsHidden);
      setStageControlsHidden(state.stageControlsHidden);
      setFrozenPage(state.frozenPage);
      setZoom(state.zoom);
    });
  };

  createEffect(
    on(
      [
        currentPage,
        blankScreen,
        bookmarkPage,
        drawings,
        drawingsHidden,
        stageControlsHidden,
        frozenPage,
        zoom,
      ],
      () => {
        const state = currentState();
        const received = receivedState();
        setReceivedState(undefined);
        if (!shouldBroadcastState(received, state)) return;
        postState();
      },
      { defer: true },
    ),
  );
  createEffect(
    on(
      transientState,
      (state) => {
        const received = receivedTransientState();
        setReceivedTransientState(undefined);
        if (received !== undefined && sameTransientState(received, state)) {
          const frame = transientFrame();
          if (frame !== undefined) cancelAnimationFrame(frame);
          setTransientFrame(undefined);
          return;
        }
        if (transientFrame() !== undefined) return;
        setTransientFrame(
          requestAnimationFrame(() => {
            setTransientFrame(undefined);
            postTransientState(untrack(transientState));
          }),
        );
      },
      { defer: true },
    ),
  );
  createRenderEffect(
    on(metadata, (deck, previousDeck) => {
      if (deck && previousDeck === undefined) {
        try {
          const value = sessionStorage.getItem(storageKey);
          if (value) {
            const stored = v.safeParse(StoredStateSchema, JSON.parse(value));
            if (
              stored.success &&
              stored.output.deck === metadataIdentity(deck) &&
              fitsDeck(stored.output.state, deck.pageCount)
            ) {
              batch(() => {
                if (initialBlankScreen === "none") {
                  setBlankScreen(stored.output.state.blankScreen);
                }
                setBookmarkPage(stored.output.state.bookmarkPage);
                setDrawings(stored.output.state.drawings);
                setDrawingsHidden(stored.output.state.drawingsHidden);
                setFrozenPage(stored.output.state.frozenPage);
              });
            }
          }
        } catch {
          // Storage is optional; presentation controls must keep working without it.
        }
        channel.postMessage({
          deck: deckId(),
          requester: role,
          type: "request-state",
        });
      }
    }),
  );
  createEffect(
    on(
      [blankScreen, bookmarkPage, drawings, drawingsHidden, frozenPage],
      savePersistentState,
      { defer: true },
    ),
  );
  onCleanup(() => {
    channel.close();
    const frame = transientFrame();
    if (frame !== undefined) cancelAnimationFrame(frame);
  });

  return {
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
    stageControlsHidden,
    setStageControlsHidden,
    requestStageControlsToggle,
    frozenPage,
    setFrozenPage,
    pointer,
    setPointer,
    zoom,
    setZoom,
    savePersistentState,
  };
};
