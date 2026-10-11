import { createRoot } from "solid-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createPresentationSync,
  shouldBroadcastState,
} from "./presentationSync";

class MockBroadcastChannel {
  static latest: MockBroadcastChannel | undefined;

  onmessage: ((event: MessageEvent) => void) | null = null;
  readonly close = vi.fn();
  readonly postMessage = vi.fn();

  constructor(readonly name: string) {
    MockBroadcastChannel.latest = this;
  }

  dispatch(data: unknown) {
    this.onmessage?.(new MessageEvent("message", { data }));
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
  MockBroadcastChannel.latest = undefined;
});

describe("createPresentationSync", () => {
  it("requests, accepts, and serves valid presentation state", async () => {
    vi.stubGlobal("BroadcastChannel", MockBroadcastChannel);
    vi.stubGlobal("location", { pathname: "/talk" });
    const { sync, dispose } = createRoot((dispose) => ({
      sync: createPresentationSync(1, false, () => 2),
      dispose,
    }));
    const channel = MockBroadcastChannel.latest;
    if (!channel) throw new Error("BroadcastChannel was not created");

    expect(channel.name).toBe("typdeck:/talk");
    expect(channel.postMessage).toHaveBeenCalledWith({
      type: "request-state",
    });
    await Promise.resolve();
    expect(sync.currentPage()).toBe(1);
    expect(sync.isBlackout()).toBe(false);
    expect(sync.pointer()).toBeNull();

    channel.postMessage.mockClear();
    channel.dispatch({
      type: "state",
      state: {
        blackout: true,
        currentPage: 2,
        pointer: { kind: "laser", page: 2, x: 0.25, y: 0.75 },
      },
    });
    expect(sync.currentPage()).toBe(2);
    expect(sync.isBlackout()).toBe(true);
    expect(sync.pointer()).toEqual({
      kind: "laser",
      page: 2,
      x: 0.25,
      y: 0.75,
    });
    await Promise.resolve();
    expect(channel.postMessage).not.toHaveBeenCalled();

    channel.dispatch({
      type: "state",
      state: { blackout: false, currentPage: 3, pointer: null },
    });
    channel.dispatch({
      type: "state",
      state: { blackout: "false", currentPage: 1, pointer: null },
    });
    channel.dispatch({
      type: "state",
      state: {
        blackout: false,
        currentPage: 1,
        pointer: { kind: "spotlight", page: 3, x: 0.5, y: 0.5 },
      },
    });
    expect(sync.currentPage()).toBe(2);
    expect(sync.isBlackout()).toBe(true);

    channel.dispatch({ type: "request-state" });
    expect(channel.postMessage).toHaveBeenCalledWith({
      type: "state",
      state: {
        blackout: true,
        currentPage: 2,
        pointer: { kind: "laser", page: 2, x: 0.25, y: 0.75 },
      },
    });

    dispose();
    expect(channel.close).toHaveBeenCalledOnce();
  });
});

describe("shouldBroadcastState", () => {
  const state = {
    blackout: false,
    currentPage: 1,
    pointer: { kind: "laser" as const, page: 1, x: 0.5, y: 0.5 },
  };

  it("suppresses received state and broadcasts local changes", () => {
    expect(
      shouldBroadcastState(state, { ...state, pointer: state.pointer }),
    ).toBe(false);
    expect(
      shouldBroadcastState(state, {
        ...state,
        pointer: { ...state.pointer, x: 0.75 },
      }),
    ).toBe(true);
  });
});
