import { describe, expect, it } from "vitest";
import type { Metadata } from "./types/metadata";
import { actionForKey, formatElapsedTime, pageLabel } from "./presentation";

const metadata: Metadata = {
  pageCount: 3,
  outline: [
    {
      text: "Opening",
      level: 1,
      page: 1,
    },
    {
      text: "Details",
      level: 1,
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

  it("uses Typst page numbering when the PDF provides it", () => {
    expect(pageLabel({ ...metadata, pageLabels: ["i", "ii", "iii"] }, 2)).toBe(
      "ii. Details",
    );
    expect(
      pageLabel({ pageCount: 1, pageLabels: ["A-1"], outline: [] }, 1),
    ).toBe("Page A-1");
  });
});

describe("presentation controls", () => {
  it("formats elapsed time", () => {
    expect(formatElapsedTime(0)).toBe("00:00:00");
    expect(formatElapsedTime(3661)).toBe("01:01:01");
  });

  it.each([
    ["ArrowLeft", false, "previous"],
    ["ArrowUp", false, "previous"],
    ["ArrowRight", false, "next"],
    ["ArrowDown", false, "next"],
    ["KeyB", false, "blackout"],
    ["Slash", true, "shortcuts"],
    ["Slash", false, undefined],
    ["KeyA", false, undefined],
  ] as const)("maps %s (shift: %s)", (code, shiftKey, expected) => {
    expect(
      actionForKey({ code, shiftKey, repeat: false, isComposing: false }),
    ).toBe(expected);
  });

  it("ignores repeated and composing keys", () => {
    expect(
      actionForKey({
        code: "ArrowRight",
        shiftKey: false,
        repeat: true,
        isComposing: false,
      }),
    ).toBeUndefined();
    expect(
      actionForKey({
        code: "ArrowRight",
        shiftKey: false,
        repeat: false,
        isComposing: true,
      }),
    ).toBeUndefined();
  });
});
