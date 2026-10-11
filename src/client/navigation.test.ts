import { describe, expect, it } from "vitest";
import type { Metadata } from "./types/metadata";
import { adjacentVisiblePage, hashForPage, pageFromHash } from "./navigation";

const metadata: Metadata = {
  pageCount: 3,
  outline: [
    {
      text: "Introduction",
      label: "introduction",
      level: 1,
      page: 1,
    },
    {
      text: "Details",
      label: "details",
      level: 1,
      page: 3,
    },
  ],
};

describe("stable slide hashes", () => {
  it("resolves page numbers and heading labels", () => {
    expect(pageFromHash("#2", metadata)).toBe(2);
    expect(pageFromHash("#details", metadata)).toBe(3);
    expect(pageFromHash("#introduction", metadata)).toBe(1);
    expect(pageFromHash("#%", metadata)).toBe(1);
    expect(pageFromHash("#4")).toBe(4);
    expect(pageFromHash("#4", metadata)).toBe(1);
  });

  it("prefers heading labels when creating hashes", () => {
    expect(hashForPage(3, metadata)).toBe("#details");
    expect(hashForPage(1, metadata)).toBe("#introduction");
    expect(hashForPage(2, metadata)).toBe("#2");
  });

  it("does not confuse numeric Typst labels with physical pages", () => {
    const numericLabel: Metadata = {
      ...metadata,
      outline: [{ text: "Numeric label", label: "2", level: 1, page: 3 }],
    };

    expect(hashForPage(3, numericLabel)).toBe("#3");
    expect(pageFromHash(hashForPage(3, numericLabel), numericLabel)).toBe(3);
  });

  it("starts on the first visible page", () => {
    const hiddenFirstPage: Metadata = {
      ...metadata,
      slides: { 1: { hidden: true } },
    };

    expect(pageFromHash("", hiddenFirstPage)).toBe(2);
    expect(pageFromHash("#4", hiddenFirstPage)).toBe(2);
    expect(pageFromHash("#1", hiddenFirstPage)).toBe(1);
    expect(
      pageFromHash("", {
        ...metadata,
        slides: {
          1: { hidden: true },
          2: { hidden: true },
          3: { hidden: true },
        },
      }),
    ).toBe(1);
  });

  it("skips hidden slides in both directions", () => {
    const deck: Metadata = {
      ...metadata,
      pageCount: 4,
      slides: {
        2: { hidden: true },
        3: { hidden: true },
      },
    };

    expect(adjacentVisiblePage(deck, 1, 1)).toBe(4);
    expect(adjacentVisiblePage(deck, 4, -1)).toBe(1);
    expect(adjacentVisiblePage(deck, 1, -1)).toBe(1);
    expect(adjacentVisiblePage(deck, 4, 1)).toBe(4);
  });
});
