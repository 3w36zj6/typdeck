import {
  type Accessor,
  batch,
  createEffect,
  createSignal,
  on,
  onCleanup,
} from "solid-js";
import * as v from "valibot";

const SlideStateSchema = v.object({
  blackout: v.boolean(),
  currentPage: v.pipe(v.number(), v.integer(), v.minValue(1)),
});

export const createPresentationSync = (
  initialPage: number,
  initialBlackout: boolean,
  pageCount: Accessor<number | undefined>,
) => {
  const [currentPage, setCurrentPage] = createSignal(initialPage);
  const [isBlackout, setIsBlackout] = createSignal(initialBlackout);
  const channel = new BroadcastChannel("slide-sync");

  channel.onmessage = (event) => {
    const state = v.safeParse(SlideStateSchema, event.data);
    if (!state.success || state.output.currentPage > (pageCount() ?? 0)) return;

    batch(() => {
      setCurrentPage(state.output.currentPage);
      setIsBlackout(state.output.blackout);
    });
  };

  createEffect(
    on(
      [currentPage, isBlackout],
      ([currentPage, blackout]) =>
        channel.postMessage({ blackout, currentPage }),
      { defer: true },
    ),
  );
  onCleanup(() => channel.close());

  return { currentPage, setCurrentPage, isBlackout, setIsBlackout };
};
