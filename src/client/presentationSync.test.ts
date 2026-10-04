import { createRoot } from "solid-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createPresentationSync } from "./presentationSync";

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
  it("accepts valid state, rejects invalid state, and closes its channel", () => {
    vi.stubGlobal("BroadcastChannel", MockBroadcastChannel);
    const { sync, dispose } = createRoot((dispose) => ({
      sync: createPresentationSync(1, false, () => 2),
      dispose,
    }));
    const channel = MockBroadcastChannel.latest;
    if (!channel) throw new Error("BroadcastChannel was not created");

    expect(channel.name).toBe("slide-sync");
    expect(sync.currentPage()).toBe(1);
    expect(sync.isBlackout()).toBe(false);

    channel.dispatch({ blackout: true, currentPage: 2 });
    expect(sync.currentPage()).toBe(2);
    expect(sync.isBlackout()).toBe(true);

    channel.dispatch({ blackout: false, currentPage: 3 });
    channel.dispatch({ blackout: "false", currentPage: 1 });
    expect(sync.currentPage()).toBe(2);
    expect(sync.isBlackout()).toBe(true);

    dispose();
    expect(channel.close).toHaveBeenCalledOnce();
  });
});
