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

const syncedState = {
  activeDrawing: {
    kind: "pen" as const,
    color: "#ff0000",
    page: 2,
    points: [
      { x: 0.25, y: 0.25 },
      { x: 0.5, y: 0.5 },
    ],
  },
  blackout: true,
  currentPage: 2,
  drawings: [
    {
      kind: "eraser" as const,
      page: 2,
      points: [
        { x: 0.1, y: 0.1 },
        { x: 0.2, y: 0.2 },
      ],
    },
  ],
  drawingsHidden: true,
  pointer: { kind: "laser" as const, page: 2, x: 0.25, y: 0.75 },
  zoom: { page: 2, x: 0.1, y: 0.2, width: 0.5, height: 0.6 },
};

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
    expect(sync.activeDrawing()).toBeNull();
    expect(sync.drawings()).toEqual([]);
    expect(sync.drawingsHidden()).toBe(false);
    expect(sync.pointer()).toBeNull();
    expect(sync.zoom()).toBeNull();

    channel.postMessage.mockClear();
    channel.dispatch({
      type: "state",
      state: syncedState,
    });
    expect(sync.currentPage()).toBe(2);
    expect(sync.isBlackout()).toBe(true);
    expect(sync.activeDrawing()?.kind).toBe("pen");
    expect(sync.drawings()).toHaveLength(1);
    expect(sync.drawingsHidden()).toBe(true);
    expect(sync.pointer()).toEqual({
      kind: "laser",
      page: 2,
      x: 0.25,
      y: 0.75,
    });
    expect(sync.zoom()).toEqual(syncedState.zoom);
    await Promise.resolve();
    expect(channel.postMessage).not.toHaveBeenCalled();

    channel.dispatch({
      type: "state",
      state: { ...syncedState, currentPage: 3 },
    });
    channel.dispatch({
      type: "state",
      state: { ...syncedState, blackout: "false" },
    });
    channel.dispatch({
      type: "state",
      state: {
        ...syncedState,
        pointer: { kind: "spotlight", page: 3, x: 0.5, y: 0.5 },
      },
    });
    channel.dispatch({
      type: "state",
      state: {
        ...syncedState,
        zoom: { page: 2, x: 0.8, y: 0.8, width: 0.5, height: 0.5 },
      },
    });
    channel.dispatch({
      type: "state",
      state: {
        ...syncedState,
        drawings: [
          {
            ...syncedState.drawings[0],
            points: [
              { x: 0.1, y: 0.1 },
              { x: 2, y: 0.2 },
            ],
          },
        ],
      },
    });
    expect(sync.currentPage()).toBe(2);
    expect(sync.isBlackout()).toBe(true);

    channel.dispatch({ type: "request-state" });
    expect(channel.postMessage).toHaveBeenCalledWith({
      type: "state",
      state: syncedState,
    });

    dispose();
    expect(channel.close).toHaveBeenCalledOnce();
  });
});

describe("shouldBroadcastState", () => {
  const state = {
    activeDrawing: null,
    blackout: false,
    currentPage: 1,
    drawings: [],
    drawingsHidden: false,
    pointer: { kind: "laser" as const, page: 1, x: 0.5, y: 0.5 },
    zoom: null,
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
    expect(
      shouldBroadcastState(state, {
        ...state,
        drawings: [
          {
            kind: "pen",
            color: "#ff0000",
            page: 1,
            points: [
              { x: 0, y: 0 },
              { x: 1, y: 1 },
            ],
          },
        ],
      }),
    ).toBe(true);
    expect(
      shouldBroadcastState(state, {
        ...state,
        zoom: { page: 1, x: 0.1, y: 0.1, width: 0.5, height: 0.5 },
      }),
    ).toBe(true);
  });
});
