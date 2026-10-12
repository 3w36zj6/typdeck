import {
  type Accessor,
  batch,
  createEffect,
  createMemo,
  createRenderEffect,
  createSignal,
  on,
  onCleanup,
} from "solid-js";
import * as v from "valibot";
import type {
  BlankScreen,
  DrawingStroke,
  SlidePointer,
  SlideZoom,
} from "./presentation";
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
  activeDrawing: v.nullable(DrawingSchema),
  blankScreen: v.picklist(["none", "black", "white"]),
  bookmarkPage: v.nullable(v.pipe(v.number(), v.integer(), v.minValue(1))),
  currentPage: v.pipe(v.number(), v.integer(), v.minValue(1)),
  drawings: v.array(DrawingSchema),
  drawingsHidden: v.boolean(),
  frozenPage: v.nullable(v.pipe(v.number(), v.integer(), v.minValue(1))),
  pointer: PointerSchema,
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
const ChannelMessageSchema = v.variant("type", [
  v.object({ deck: v.string(), type: v.literal("request-state") }),
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

const fitsDeck = (state: PersistentState, pageCount: number) =>
  (state.bookmarkPage === null || state.bookmarkPage <= pageCount) &&
  state.drawings.every(({ page }) => page <= pageCount) &&
  (state.frozenPage === null || state.frozenPage <= pageCount);

export const shouldBroadcastState = (
  received: SlideState | undefined,
  current: SlideState,
) =>
  received === undefined ||
  !sameDrawing(received.activeDrawing, current.activeDrawing) ||
  received.blankScreen !== current.blankScreen ||
  received.bookmarkPage !== current.bookmarkPage ||
  received.currentPage !== current.currentPage ||
  !sameDrawings(received.drawings, current.drawings) ||
  received.drawingsHidden !== current.drawingsHidden ||
  received.frozenPage !== current.frozenPage ||
  !samePointer(received.pointer, current.pointer) ||
  !sameZoom(received.zoom, current.zoom);

export const createPresentationSync = (
  initialPage: number,
  initialBlankScreen: BlankScreen,
  metadata: Accessor<Metadata | undefined>,
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
  let receivedState: SlideState | undefined;

  const currentState = () => ({
    activeDrawing: activeDrawing(),
    blankScreen: blankScreen(),
    bookmarkPage: bookmarkPage(),
    currentPage: currentPage(),
    drawings: drawings(),
    drawingsHidden: drawingsHidden(),
    frozenPage: frozenPage(),
    pointer: pointer(),
    zoom: zoom(),
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
    if (message.output.type === "request-state") {
      postState();
      return;
    }

    const state = message.output.state;
    const pages = deck.pageCount;
    if (
      state.currentPage > pages ||
      !fitsDeck(state, pages) ||
      (state.activeDrawing !== null && state.activeDrawing.page > pages) ||
      (state.pointer !== null && state.pointer.page > pages) ||
      (state.zoom !== null && state.zoom.page > pages)
    ) {
      return;
    }

    receivedState = state;
    batch(() => {
      setActiveDrawing(state.activeDrawing);
      setCurrentPage(state.currentPage);
      setBlankScreen(state.blankScreen);
      setBookmarkPage(state.bookmarkPage);
      setDrawings(state.drawings);
      setDrawingsHidden(state.drawingsHidden);
      setFrozenPage(state.frozenPage);
      setPointer(state.pointer);
      setZoom(state.zoom);
    });
  };

  createEffect(
    on(
      [
        activeDrawing,
        currentPage,
        blankScreen,
        bookmarkPage,
        drawings,
        drawingsHidden,
        frozenPage,
        pointer,
        zoom,
      ],
      () => {
        const state = currentState();
        if (!shouldBroadcastState(receivedState, state)) {
          receivedState = undefined;
          return;
        }
        receivedState = undefined;
        postState();
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
  onCleanup(() => channel.close());

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
    frozenPage,
    setFrozenPage,
    pointer,
    setPointer,
    zoom,
    setZoom,
    savePersistentState,
  };
};
