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
const syncedState = {
  blankScreen: "white",
  bookmarkPage: 2,
  currentPage: 2,
  drawings: [
    {
      kind: "pen",
      color: "#ff2222",
      page: 2,
      size: 1,
      points: [
        { x: 0.1, y: 0.2 },
        { x: 0.3, y: 0.4 },
      ],
    },
  ],
  drawingsHidden: true,
  frozenPage: 1,
  zoom: { page: 2, x: 0.2, y: 0.25, width: 0.5, height: 0.5 },
} satisfies Parameters<typeof shouldBroadcastState>[1];
const syncedPointer = {
  kind: "spotlight",
  page: 2,
  size: 1.25,
  x: 0.25,
  y: 0.75,
} as const;

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

const createSync = (
  blankScreen: "none" | "black" = "none",
  role: "stage" | "presenter" = "stage",
) =>
  createRoot((dispose) => ({
    sync: createPresentationSync(1, blankScreen, role, () => metadata),
    dispose,
  }));

afterEach(() => {
  vi.unstubAllGlobals();
  MockBroadcastChannel.latest = undefined;
});

describe("createPresentationSync", () => {
  it("exchanges state only for the current deck", () => {
    vi.stubGlobal("BroadcastChannel", MockBroadcastChannel);
    stubStorage();
    const { sync, dispose } = createSync();
    const channel = MockBroadcastChannel.latest;
    if (!channel) throw new Error("BroadcastChannel was not created");

    expect(channel.name).toBe("typdeck:/talk");
    expect(channel.postMessage).toHaveBeenCalledWith({
      deck,
      requester: "stage",
      type: "request-state",
    });

    channel.dispatch({
      deck: "different deck",
      type: "state",
      state: syncedState,
    });
    expect(sync.currentPage()).toBe(1);

    channel.dispatch({ deck, type: "state", state: syncedState });
    channel.dispatch({
      deck,
      state: {
        activeDrawing: syncedState.drawings[0],
        pointer: syncedPointer,
      },
      type: "transient-state",
    });
    expect(sync.currentPage()).toBe(2);
    expect(sync.blankScreen()).toBe("white");
    expect(sync.activeDrawing()).toEqual(syncedState.drawings[0]);
    expect(sync.pointer()).toEqual(syncedPointer);
    expect(sync.drawings()).toEqual(syncedState.drawings);
    expect(sync.zoom()).toEqual(syncedState.zoom);

    channel.postMessage.mockClear();
    channel.dispatch({ deck, requester: "stage", type: "request-state" });
    expect(channel.postMessage).not.toHaveBeenCalled();

    channel.dispatch({ deck, requester: "presenter", type: "request-state" });
    expect(channel.postMessage).toHaveBeenCalledWith({
      deck,
      type: "state",
      state: syncedState,
    });
    expect(channel.postMessage).toHaveBeenCalledWith({
      deck,
      state: {
        activeDrawing: syncedState.drawings[0],
        pointer: syncedPointer,
      },
      type: "transient-state",
    });

    dispose();
    expect(channel.close).toHaveBeenCalledOnce();
  });

  it("rejects invalid and out-of-range channel state", () => {
    vi.stubGlobal("BroadcastChannel", MockBroadcastChannel);
    stubStorage();
    const { sync, dispose } = createSync();
    const channel = MockBroadcastChannel.latest;
    if (!channel) throw new Error("BroadcastChannel was not created");

    channel.dispatch({
      deck,
      type: "state",
      state: { ...syncedState, blankScreen: "invalid" },
    });
    channel.dispatch({
      deck,
      type: "state",
      state: { ...syncedState, currentPage: 3 },
    });
    channel.dispatch({
      deck,
      state: {
        activeDrawing: null,
        pointer: { ...syncedPointer, page: 3 },
      },
      type: "transient-state",
    });
    expect(sync.currentPage()).toBe(1);
    expect(sync.blankScreen()).toBe("none");
    expect(sync.pointer()).toBeNull();
    dispose();
  });

  it("restores matching persistent state without overriding the URL page", () => {
    vi.stubGlobal("BroadcastChannel", MockBroadcastChannel);
    stubStorage(
      JSON.stringify({
        deck,
        state: {
          blankScreen: "black",
          bookmarkPage: 2,
          drawings: syncedState.drawings,
          drawingsHidden: true,
          frozenPage: 1,
        },
      }),
    );

    const { sync, dispose } = createSync();
    expect(sync.currentPage()).toBe(1);
    expect(sync.blankScreen()).toBe("black");
    expect(sync.bookmarkPage()).toBe(2);
    expect(sync.drawings()).toEqual(syncedState.drawings);
    expect(sync.drawingsHidden()).toBe(true);
    expect(sync.frozenPage()).toBe(1);
    dispose();
  });

  it("ignores persistent state from another deck", () => {
    vi.stubGlobal("BroadcastChannel", MockBroadcastChannel);
    stubStorage(
      JSON.stringify({
        deck: "different deck",
        state: {
          blankScreen: "black",
          bookmarkPage: null,
          drawings: [],
          drawingsHidden: false,
          frozenPage: 1,
        },
      }),
    );

    const { sync, dispose } = createSync();
    expect(sync.blankScreen()).toBe("none");
    expect(sync.frozenPage()).toBeNull();
    dispose();
  });

  it("keeps an explicit initial blank screen over persistent state", () => {
    vi.stubGlobal("BroadcastChannel", MockBroadcastChannel);
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

    const { sync, dispose } = createSync("black");
    expect(sync.blankScreen()).toBe("black");
    dispose();
  });

  it("persists completed drawings but not transient state", () => {
    vi.stubGlobal("BroadcastChannel", MockBroadcastChannel);
    stubStorage();
    const { sync, dispose } = createSync();
    sync.setActiveDrawing(syncedState.drawings[0]);
    sync.setPointer(syncedPointer);
    sync.setZoom(syncedState.zoom);
    sync.setDrawings(syncedState.drawings);
    sync.savePersistentState();

    const stored = JSON.parse(
      vi.mocked(sessionStorage.setItem).mock.lastCall?.[1] ?? "null",
    );
    expect(stored.state.drawings).toEqual(syncedState.drawings);
    expect(stored.state).not.toHaveProperty("activeDrawing");
    expect(stored.state).not.toHaveProperty("currentPage");
    expect(stored.state).not.toHaveProperty("pointer");
    expect(stored.state).not.toHaveProperty("zoom");
    dispose();
  });

  it("keeps working when session storage is unavailable", () => {
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

    const { sync, dispose } = createSync();
    expect(() => sync.savePersistentState()).not.toThrow();
    sync.setBlankScreen("white");
    expect(sync.blankScreen()).toBe("white");
    dispose();
  });
});

describe("shouldBroadcastState", () => {
  it("suppresses received state and broadcasts local changes", () => {
    expect(shouldBroadcastState(syncedState, syncedState)).toBe(false);
    expect(
      shouldBroadcastState(syncedState, {
        ...syncedState,
        frozenPage: null,
      }),
    ).toBe(true);
  });
});
