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
import type { DrawingStroke, SlidePointer } from "./presentation";

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
  blackout: v.boolean(),
  currentPage: v.pipe(v.number(), v.integer(), v.minValue(1)),
  drawings: v.array(DrawingSchema),
  drawingsHidden: v.boolean(),
  pointer: PointerSchema,
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
  received.blackout !== current.blackout ||
  received.currentPage !== current.currentPage ||
  !sameDrawings(received.drawings, current.drawings) ||
  received.drawingsHidden !== current.drawingsHidden ||
  !samePointer(received.pointer, current.pointer);

export const createPresentationSync = (
  initialPage: number,
  initialBlackout: boolean,
  pageCount: Accessor<number | undefined>,
) => {
  const [currentPage, setCurrentPage] = createSignal(initialPage);
  const [isBlackout, setIsBlackout] = createSignal(initialBlackout);
  const [activeDrawing, setActiveDrawing] = createSignal<DrawingStroke | null>(
    null,
    { equals: sameDrawing },
  );
  const [drawings, setDrawings] = createSignal<DrawingStroke[]>([], {
    equals: sameDrawings,
  });
  const [drawingsHidden, setDrawingsHidden] = createSignal(false);
  const [pointer, setPointer] = createSignal<SlidePointer | null>(null, {
    equals: samePointer,
  });
  const channel = new BroadcastChannel(`typdeck:${location.pathname}`);
  let receivedState: SlideState | undefined;

  const currentState = () => ({
    activeDrawing: activeDrawing(),
    blackout: isBlackout(),
    currentPage: currentPage(),
    drawings: drawings(),
    drawingsHidden: drawingsHidden(),
    pointer: pointer(),
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
      (state.activeDrawing !== null && state.activeDrawing.page > pages) ||
      state.drawings.some(({ page }) => page > pages) ||
      (state.pointer !== null && state.pointer.page > pages)
    ) {
      return;
    }
    receivedState = state;
    batch(() => {
      setActiveDrawing(state.activeDrawing);
      setCurrentPage(state.currentPage);
      setIsBlackout(state.blackout);
      setDrawings(state.drawings);
      setDrawingsHidden(state.drawingsHidden);
      setPointer(state.pointer);
    });
  };

  createEffect(
    on(
      [
        activeDrawing,
        currentPage,
        isBlackout,
        drawings,
        drawingsHidden,
        pointer,
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
    isBlackout,
    setIsBlackout,
    drawings,
    setDrawings,
    drawingsHidden,
    setDrawingsHidden,
    pointer,
    setPointer,
  };
};
