import { describe, expect, it } from "vitest";
import type { Metadata } from "./types/metadata";
import { pageLabel } from "./presentation";

const metadata: Metadata = {
  pageCount: 3,
  outline: [
    {
      text: "Opening",
      page: 1,
    },
    {
      text: "Details",
      page: 2,
    },
  ],
};

describe("pageLabel", () => {
  it("uses Typst headings and falls back to page numbers", () => {
    expect(pageLabel(metadata, 1)).toBe("1. Opening");
    expect(pageLabel(metadata, 2)).toBe("2. Details");
    expect(pageLabel(metadata, 3)).toBe("Page 3");
  });
});
