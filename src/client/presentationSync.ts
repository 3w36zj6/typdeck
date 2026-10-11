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
import type { SlidePointer } from "./presentation";

const PointerSchema = v.nullable(
  v.object({
    kind: v.picklist(["laser", "spotlight"]),
    page: v.pipe(v.number(), v.integer(), v.minValue(1)),
    x: v.pipe(v.number(), v.minValue(0), v.maxValue(1)),
    y: v.pipe(v.number(), v.minValue(0), v.maxValue(1)),
  }),
);

const SlideStateSchema = v.object({
  blackout: v.boolean(),
  currentPage: v.pipe(v.number(), v.integer(), v.minValue(1)),
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

type SlideState = v.InferOutput<typeof SlideStateSchema>;

export const shouldBroadcastState = (
  received: SlideState | undefined,
  current: SlideState,
) =>
  received === undefined ||
  received.blackout !== current.blackout ||
  received.currentPage !== current.currentPage ||
  !samePointer(received.pointer, current.pointer);

export const createPresentationSync = (
  initialPage: number,
  initialBlackout: boolean,
  pageCount: Accessor<number | undefined>,
) => {
  const [currentPage, setCurrentPage] = createSignal(initialPage);
  const [isBlackout, setIsBlackout] = createSignal(initialBlackout);
  const [pointer, setPointer] = createSignal<SlidePointer | null>(null, {
    equals: samePointer,
  });
  const channel = new BroadcastChannel(`typdeck:${location.pathname}`);
  let receivedState: SlideState | undefined;

  const currentState = () => ({
    blackout: isBlackout(),
    currentPage: currentPage(),
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
      (state.pointer !== null && state.pointer.page > pages)
    ) {
      return;
    }
    receivedState = state;
    batch(() => {
      setCurrentPage(state.currentPage);
      setIsBlackout(state.blackout);
      setPointer(state.pointer);
    });
  };

  createEffect(
    on(
      [currentPage, isBlackout, pointer],
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
    currentPage,
    setCurrentPage,
    isBlackout,
    setIsBlackout,
    pointer,
    setPointer,
  };
};
