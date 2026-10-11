import { createRoot } from "solid-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createPresentationSync,
  shouldBroadcastState,
} from "./presentationSync";
import { metadataIdentity, type Metadata } from "./types/metadata";

const metadata: Metadata = {
  pageCount: 2,
  outline: [{ page: 1, text: "Opening", level: 1 }],
};
const deck = metadataIdentity(metadata);

const stubStorage = (value?: string) => {
  const entries = new Map<string, string>();
  if (value) entries.set("typdeck:/talk", value);
  vi.stubGlobal("location", { pathname: "/talk" });
  vi.stubGlobal("sessionStorage", {
    getItem: vi.fn((key: string) => entries.get(key) ?? null),
    setItem: vi.fn((key: string, next: string) => entries.set(key, next)),
  });
};

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
  blankScreen: "white" as const,
  bookmarkPage: 1,
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
  frozenPage: 1,
  pointer: { kind: "laser" as const, page: 2, x: 0.25, y: 0.75 },
  zoom: { page: 2, x: 0.1, y: 0.2, width: 0.5, height: 0.6 },
};

describe("createPresentationSync", () => {
  it("requests, accepts, and serves valid presentation state", async () => {
    vi.stubGlobal("BroadcastChannel", MockBroadcastChannel);
    stubStorage();
    const { sync, dispose } = createRoot((dispose) => ({
      sync: createPresentationSync(1, "none", () => metadata),
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
    expect(sync.blankScreen()).toBe("none");
    expect(sync.bookmarkPage()).toBeNull();
    expect(sync.activeDrawing()).toBeNull();
    expect(sync.drawings()).toEqual([]);
    expect(sync.drawingsHidden()).toBe(false);
    expect(sync.frozenPage()).toBeNull();
    expect(sync.pointer()).toBeNull();
    expect(sync.zoom()).toBeNull();

    channel.postMessage.mockClear();
    channel.dispatch({
      type: "state",
      state: syncedState,
    });
    expect(sync.currentPage()).toBe(2);
    expect(sync.blankScreen()).toBe("white");
    expect(sync.bookmarkPage()).toBe(1);
    expect(sync.activeDrawing()?.kind).toBe("pen");
    expect(sync.drawings()).toHaveLength(1);
    expect(sync.drawingsHidden()).toBe(true);
    expect(sync.frozenPage()).toBe(1);
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
      state: { ...syncedState, bookmarkPage: 3 },
    });
    channel.dispatch({
      type: "state",
      state: { ...syncedState, frozenPage: 3 },
    });
    channel.dispatch({
      type: "state",
      state: { ...syncedState, blankScreen: "blue" },
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
    expect(sync.blankScreen()).toBe("white");

    channel.dispatch({ type: "request-state" });
    expect(channel.postMessage).toHaveBeenCalledWith({
      type: "state",
      state: syncedState,
    });

    dispose();
    expect(channel.close).toHaveBeenCalledOnce();
  });

  it("restores matching session state without overriding the URL page", () => {
    vi.stubGlobal("BroadcastChannel", MockBroadcastChannel);
    stubStorage(
      JSON.stringify({
        deck,
        state: {
          blankScreen: "black",
          bookmarkPage: 1,
          drawings: syncedState.drawings,
          drawingsHidden: true,
          frozenPage: 1,
        },
      }),
    );

    const { sync, dispose } = createRoot((dispose) => ({
      sync: createPresentationSync(2, "none", () => metadata),
      dispose,
    }));

    expect(sync.currentPage()).toBe(2);
    expect(sync.blankScreen()).toBe("black");
    expect(sync.bookmarkPage()).toBe(1);
    expect(sync.drawings()).toEqual(syncedState.drawings);
    expect(sync.drawingsHidden()).toBe(true);
    expect(sync.frozenPage()).toBe(1);
    expect(sync.activeDrawing()).toBeNull();
    expect(sync.pointer()).toBeNull();
    expect(sync.zoom()).toBeNull();
    dispose();
  });

  it("ignores state from another deck and keeps an explicit blank screen", () => {
    vi.stubGlobal("BroadcastChannel", MockBroadcastChannel);
    stubStorage(
      JSON.stringify({
        deck: "another deck",
        state: {
          blankScreen: "white",
          bookmarkPage: 1,
          drawings: syncedState.drawings,
          drawingsHidden: true,
          frozenPage: 1,
        },
      }),
    );
    const first = createRoot((dispose) => ({
      sync: createPresentationSync(1, "black", () => metadata),
      dispose,
    }));
    expect(first.sync.blankScreen()).toBe("black");
    expect(first.sync.drawings()).toEqual([]);
    first.dispose();

    stubStorage(
      JSON.stringify({
        deck,
        state: {
          blankScreen: "white",
          bookmarkPage: null,
          drawings: [],
          drawingsHidden: false,
          frozenPage: null,
        },
      }),
    );
    const second = createRoot((dispose) => ({
      sync: createPresentationSync(1, "black", () => metadata),
      dispose,
    }));
    expect(second.sync.blankScreen()).toBe("black");
    second.dispose();
  });

  it("rejects stored pages outside the deck", () => {
    vi.stubGlobal("BroadcastChannel", MockBroadcastChannel);
    stubStorage(
      JSON.stringify({
        deck,
        state: {
          blankScreen: "black",
          bookmarkPage: 3,
          drawings: syncedState.drawings,
          drawingsHidden: true,
          frozenPage: null,
        },
      }),
    );
    const { sync, dispose } = createRoot((dispose) => ({
      sync: createPresentationSync(1, "none", () => metadata),
      dispose,
    }));

    expect(sync.blankScreen()).toBe("none");
    expect(sync.bookmarkPage()).toBeNull();
    expect(sync.drawings()).toEqual([]);
    dispose();
  });

  it("persists completed drawings but not transient state", () => {
    vi.stubGlobal("BroadcastChannel", MockBroadcastChannel);
    stubStorage();
    const { sync, dispose } = createRoot((dispose) => ({
      sync: createPresentationSync(1, "none", () => metadata),
      dispose,
    }));
    sync.setActiveDrawing(syncedState.activeDrawing);
    sync.setBookmarkPage(2);
    sync.setPointer(syncedState.pointer);
    sync.setZoom(syncedState.zoom);
    sync.setDrawings(syncedState.drawings);
    sync.savePersistentState();

    const stored = JSON.parse(
      vi.mocked(sessionStorage.setItem).mock.lastCall?.[1] ?? "null",
    );
    expect(stored.state.drawings).toEqual(syncedState.drawings);
    expect(stored.state.bookmarkPage).toBe(2);
    expect(stored.state).not.toHaveProperty("activeDrawing");
    expect(stored.state).not.toHaveProperty("pointer");
    expect(stored.state).not.toHaveProperty("zoom");
    dispose();
  });

  it("works when session storage is unavailable", () => {
    vi.stubGlobal("BroadcastChannel", MockBroadcastChannel);
    vi.stubGlobal("location", { pathname: "/talk" });
    vi.stubGlobal("sessionStorage", {
      getItem: vi.fn(() => {
        throw new DOMException("Denied", "SecurityError");
      }),
      setItem: vi.fn(() => {
        throw new DOMException("Full", "QuotaExceededError");
      }),
    });

    const { sync, dispose } = createRoot((dispose) => ({
      sync: createPresentationSync(1, "none", () => metadata),
      dispose,
    }));
    expect(() => sync.savePersistentState()).not.toThrow();
    sync.setBlankScreen("white");
    expect(sync.blankScreen()).toBe("white");
    dispose();
  });
});

describe("shouldBroadcastState", () => {
  const state = {
    activeDrawing: null,
    blankScreen: "none" as const,
    bookmarkPage: null,
    currentPage: 1,
    drawings: [],
    drawingsHidden: false,
    frozenPage: null,
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
        bookmarkPage: 1,
      }),
    ).toBe(true);
    expect(
      shouldBroadcastState(state, {
        ...state,
        blankScreen: "black",
      }),
    ).toBe(true);
    expect(
      shouldBroadcastState(state, {
        ...state,
        frozenPage: 1,
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
