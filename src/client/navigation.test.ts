import { describe, expect, it } from "vitest";
import type { Metadata } from "./types/metadata";
import { hashForPage, pageFromHash } from "./navigation";

const metadata: Metadata = {
  pageCount: 3,
  outline: [
    {
      text: "Introduction",
      label: "introduction",
      page: 1,
    },
    {
      text: "Details",
      label: "details",
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
  });

  it("prefers heading labels when creating hashes", () => {
    expect(hashForPage(3, metadata)).toBe("#details");
    expect(hashForPage(1, metadata)).toBe("#introduction");
    expect(hashForPage(2, metadata)).toBe("#2");
  });
});
