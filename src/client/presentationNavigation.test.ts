import { describe, expect, it } from "vitest";
import type { Metadata } from "./types/metadata";
import { adjacentLogicalSlidePage } from "./presentation";

describe("adjacentLogicalSlidePage", () => {
  const deck: Metadata = {
    pageCount: 7,
    outline: [],
    slides: {
      1: { logicalSlide: 1, overlay: 0 },
      2: { logicalSlide: 1, overlay: 1 },
      3: { hidden: true },
      4: { logicalSlide: 2, overlay: 0 },
      5: { logicalSlide: 2, overlay: 1, hidden: true },
      7: { hidden: true },
    },
  };

  it("moves to the first overlay of an adjacent logical slide", () => {
    expect(adjacentLogicalSlidePage(deck, 1, 1)).toBe(4);
    expect(adjacentLogicalSlidePage(deck, 2, 1)).toBe(4);
    expect(adjacentLogicalSlidePage(deck, 5, -1)).toBe(1);
    expect(adjacentLogicalSlidePage(deck, 6, -1)).toBe(4);
  });

  it("skips hidden pages and keeps the current edge", () => {
    expect(adjacentLogicalSlidePage(deck, 3, 1)).toBe(4);
    expect(adjacentLogicalSlidePage(deck, 3, -1)).toBe(1);
    expect(adjacentLogicalSlidePage(deck, 1, -1)).toBe(1);
    expect(adjacentLogicalSlidePage(deck, 6, 1)).toBe(6);
  });
});
