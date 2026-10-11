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

const SlideStateSchema = v.object({
  blackout: v.boolean(),
  currentPage: v.pipe(v.number(), v.integer(), v.minValue(1)),
});
const ChannelMessageSchema = v.variant("type", [
  v.object({ type: v.literal("request-state") }),
  v.object({ type: v.literal("state"), state: SlideStateSchema }),
]);

export const createPresentationSync = (
  initialPage: number,
  initialBlackout: boolean,
  pageCount: Accessor<number | undefined>,
) => {
  const [currentPage, setCurrentPage] = createSignal(initialPage);
  const [isBlackout, setIsBlackout] = createSignal(initialBlackout);
  const channel = new BroadcastChannel(`typdeck:${location.pathname}`);

  const currentState = () => ({
    blackout: isBlackout(),
    currentPage: currentPage(),
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
    if (state.currentPage > (pageCount() ?? 0)) return;
    batch(() => {
      setCurrentPage(state.currentPage);
      setIsBlackout(state.blackout);
    });
  };

  createEffect(on([currentPage, isBlackout], postState, { defer: true }));
  createRenderEffect(
    on(pageCount, (pages, previousPages) => {
      if (pages !== undefined && previousPages === undefined) {
        channel.postMessage({ type: "request-state" });
      }
    }),
  );
  onCleanup(() => channel.close());

  return { currentPage, setCurrentPage, isBlackout, setIsBlackout };
};
