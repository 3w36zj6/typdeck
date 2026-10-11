import { describe, expect, it } from "vitest";
import type { Metadata } from "./types/metadata";
import {
  actionForKey,
  endSlidePage,
  formatElapsedTime,
  nextPreviewPage,
  pageLabel,
  presentationPositionLabel,
  previousPresentationPage,
  savedSlidePage,
} from "./presentation";

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

describe("overlay presentation", () => {
  const deck: Metadata = {
    pageCount: 5,
    outline: [{ text: "Reveal", level: 1, page: 1 }],
    slides: {
      1: { logicalSlide: 1, overlay: 0 },
      2: { logicalSlide: 1, overlay: 1 },
      3: { logicalSlide: 1, overlay: 2 },
      4: { logicalSlide: 2, overlay: 0 },
    },
  };

  it("uses the logical slide heading on every overlay", () => {
    expect(pageLabel(deck, 2)).toBe("2. Reveal");
  });

  it("previews the completed logical slide", () => {
    expect(nextPreviewPage(deck, 1)).toBe(3);
    expect(nextPreviewPage(deck, 2)).toBe(3);
    expect(nextPreviewPage(deck, 3)).toBe(4);
  });

  it("excludes hidden overlays from previews and progress", () => {
    const hiddenOverlay: Metadata = {
      ...deck,
      slides: {
        ...deck.slides,
        3: { logicalSlide: 1, overlay: 2, hidden: true },
      },
    };

    expect(nextPreviewPage(hiddenOverlay, 1)).toBe(2);
    expect(nextPreviewPage(hiddenOverlay, 3)).toBe(4);
    expect(presentationPositionLabel(hiddenOverlay, 2)).toBe(
      "Slide 1 of 3\nStep 2 of 2",
    );
    expect(presentationPositionLabel(hiddenOverlay, 3)).toBe("Hidden slide");
  });

  it("returns to the first overlay across slide boundaries", () => {
    expect(previousPresentationPage(deck, 3)).toBe(2);
    expect(previousPresentationPage(deck, 4)).toBe(1);
  });

  it("reports logical slide and overlay progress", () => {
    expect(presentationPositionLabel(deck, 2)).toBe(
      "Slide 1 of 3\nStep 2 of 3",
    );
    expect(presentationPositionLabel(deck, 4)).toBe("Slide 2 of 3");
    expect(presentationPositionLabel(deck, 5)).toBe("Slide 3 of 3");
  });

  it("labels logical slides after the end slide as appendices", () => {
    const deckWithAppendix: Metadata = {
      ...deck,
      pageCount: 6,
      slides: {
        ...deck.slides,
        4: { logicalSlide: 2, overlay: 0, endSlide: true },
        5: { logicalSlide: 3, overlay: 0 },
        6: { logicalSlide: 3, overlay: 1 },
      },
    };

    expect(presentationPositionLabel(deckWithAppendix, 4)).toBe("Slide 2 of 2");
    expect(presentationPositionLabel(deckWithAppendix, 5)).toBe(
      "Appendix 1 of 1\nStep 1 of 2",
    );
    expect(presentationPositionLabel(deckWithAppendix, 6)).toBe(
      "Appendix 1 of 1\nStep 2 of 2",
    );
    expect(nextPreviewPage(deckWithAppendix, 4)).toBe(6);
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
    ["End", false, "last"],
    ["KeyM", true, "saved"],
    ["KeyM", false, undefined],
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

describe("pdfpc navigation markers", () => {
  it("uses the first visible overlay in the first marked logical slide", () => {
    const deck: Metadata = {
      pageCount: 4,
      outline: [],
      slides: {
        1: {
          logicalSlide: 1,
          overlay: 0,
          hidden: true,
          endSlide: true,
          savedSlide: true,
        },
        2: {
          logicalSlide: 1,
          overlay: 1,
          endSlide: true,
          savedSlide: true,
        },
        4: { endSlide: true, savedSlide: true },
      },
    };

    expect(endSlidePage(deck)).toBe(2);
    expect(savedSlidePage(deck)).toBe(2);
  });

  it("keeps the marker page when every overlay is hidden", () => {
    const deck: Metadata = {
      pageCount: 2,
      outline: [],
      slides: {
        1: {
          logicalSlide: 1,
          overlay: 0,
          hidden: true,
          endSlide: true,
          savedSlide: true,
        },
        2: { logicalSlide: 1, overlay: 1, hidden: true },
      },
    };

    expect(endSlidePage(deck)).toBe(1);
    expect(savedSlidePage(deck)).toBe(1);
  });

  it("falls back only for the end slide", () => {
    const deck: Metadata = {
      pageCount: 3,
      outline: [],
      slides: { 3: { hidden: true } },
    };

    expect(endSlidePage(deck)).toBe(2);
    expect(savedSlidePage(deck)).toBeUndefined();
  });
});
