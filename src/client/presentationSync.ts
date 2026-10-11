import {
  type Accessor,
  batch,
  createEffect,
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

const PointSchema = v.object({
  x: v.pipe(v.number(), v.minValue(0), v.maxValue(1)),
  y: v.pipe(v.number(), v.minValue(0), v.maxValue(1)),
});

const PointerSchema = v.nullable(
  v.object({
    kind: v.picklist(["laser", "spotlight"]),
    page: v.pipe(v.number(), v.integer(), v.minValue(1)),
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
  currentPage: v.pipe(v.number(), v.integer(), v.minValue(1)),
  drawings: v.array(DrawingSchema),
  drawingsHidden: v.boolean(),
  frozenPage: v.nullable(v.pipe(v.number(), v.integer(), v.minValue(1))),
  pointer: PointerSchema,
  zoom: ZoomSchema,
});
const ChannelMessageSchema = v.variant("type", [
  v.object({ type: v.literal("request-state") }),
  v.object({ type: v.literal("state"), state: SlideStateSchema }),
]);

const samePointer = (left: SlidePointer | null, right: SlidePointer | null) =>
  left === right ||
  (left !== null &&
    right !== null &&
    left.kind === right.kind &&
    left.page === right.page &&
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

export const shouldBroadcastState = (
  received: SlideState | undefined,
  current: SlideState,
) =>
  received === undefined ||
  !sameDrawing(received.activeDrawing, current.activeDrawing) ||
  received.blankScreen !== current.blankScreen ||
  received.currentPage !== current.currentPage ||
  !sameDrawings(received.drawings, current.drawings) ||
  received.drawingsHidden !== current.drawingsHidden ||
  received.frozenPage !== current.frozenPage ||
  !samePointer(received.pointer, current.pointer) ||
  !sameZoom(received.zoom, current.zoom);

export const createPresentationSync = (
  initialPage: number,
  initialBlankScreen: BlankScreen,
  pageCount: Accessor<number | undefined>,
) => {
  const [currentPage, setCurrentPage] = createSignal(initialPage);
  const [blankScreen, setBlankScreen] =
    createSignal<BlankScreen>(initialBlankScreen);
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
  const channel = new BroadcastChannel(`typdeck:${location.pathname}`);
  let receivedState: SlideState | undefined;

  const currentState = () => ({
    activeDrawing: activeDrawing(),
    blankScreen: blankScreen(),
    currentPage: currentPage(),
    drawings: drawings(),
    drawingsHidden: drawingsHidden(),
    frozenPage: frozenPage(),
    pointer: pointer(),
    zoom: zoom(),
  });
  const postState = () =>
    channel.postMessage({ type: "state", state: currentState() });

  channel.onmessage = (event) => {
    const message = v.safeParse(ChannelMessageSchema, event.data);
    if (!message.success) return;
    if (message.output.type === "request-state") {
      postState();
      return;
    }

    const state = message.output.state;
    const pages = pageCount() ?? 0;
    if (
      state.currentPage > pages ||
      (state.frozenPage !== null && state.frozenPage > pages) ||
      (state.activeDrawing !== null && state.activeDrawing.page > pages) ||
      state.drawings.some(({ page }) => page > pages) ||
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
    on(pageCount, (pages, previousPages) => {
      if (pages !== undefined && previousPages === undefined) {
        channel.postMessage({ type: "request-state" });
      }
    }),
  );
  onCleanup(() => channel.close());

  return {
    activeDrawing,
    setActiveDrawing,
    currentPage,
    setCurrentPage,
    blankScreen,
    setBlankScreen,
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
  };
};
