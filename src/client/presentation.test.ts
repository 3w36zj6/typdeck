import { describe, expect, it } from "vitest";
import type { Metadata } from "./types/metadata";
import {
  actionForKey,
  completedSlidePage,
  drawingLayers,
  endSlidePage,
  formatElapsedTime,
  formatRemainingTime,
  headingForPage,
  logicalSlideStartPage,
  nextPreviewPage,
  overviewPages,
  pageLabel,
  presentationDurationMinutes,
  presentationPace,
  presentationPositionLabel,
  presentationStartAt,
  previousPresentationPage,
  remainingSeconds,
  savedSlidePage,
  slideRectFromPoints,
  timingBreakdownRows,
  updateSlideTiming,
} from "./presentation";

describe("slideRectFromPoints", () => {
  it("normalizes a drag in either direction", () => {
    const rect = slideRectFromPoints({ x: 0.8, y: 0.7 }, { x: 0.2, y: 0.3 });
    expect(rect.x).toBe(0.2);
    expect(rect.y).toBe(0.3);
    expect(rect.width).toBeCloseTo(0.6);
    expect(rect.height).toBeCloseTo(0.4);
  });
});

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

describe("presentation timing", () => {
  it("combines overlays and repeated visits without counting paused time", () => {
    const deck: Metadata = {
      pageCount: 3,
      outline: [],
      slides: {
        1: { logicalSlide: 1, overlay: 0 },
        2: { logicalSlide: 1, overlay: 1 },
        3: { logicalSlide: 2, overlay: 0 },
      },
    };
    const initial = { page: 1, elapsedMilliseconds: 0, durations: {} };
    const overlay = updateSlideTiming(deck, initial, 2, 1_000);
    const next = updateSlideTiming(deck, overlay, 3, 2_000);
    const paused = updateSlideTiming(deck, next, 1, 2_000);
    const revisited = updateSlideTiming(deck, paused, 3, 2_500);

    expect(updateSlideTiming(deck, revisited, 3, 3_500).durations).toEqual({
      1: 2_500,
      3: 1_000,
    });
  });

  it("aggregates Typst heading sections without losing unheaded slides", () => {
    const deck: Metadata = {
      pageCount: 4,
      outline: [
        { text: "Section", level: 1, page: 1 },
        { text: "Opening", level: 2, page: 1 },
        { text: "Details", level: 2, page: 2 },
        { text: "Conclusion", level: 1, page: 4 },
      ],
    };

    expect(
      timingBreakdownRows(deck, { 1: 1_000, 2: 2_000, 3: 3_000, 4: 4_000 }),
    ).toEqual([
      { label: "1. Section", level: 1, milliseconds: 6_000 },
      { label: "1. Opening", level: 2, milliseconds: 1_000 },
      { label: "2. Details", level: 2, milliseconds: 5_000 },
      { label: "Page 3", level: 3, milliseconds: 3_000 },
      { label: "4. Conclusion", level: 1, milliseconds: 4_000 },
    ]);

    expect(
      timingBreakdownRows(
        {
          pageCount: 2,
          outline: [
            { text: "Reveal", level: 2, page: 1 },
            { text: "Reveal", level: 2, page: 2 },
          ],
          slides: {
            1: { logicalSlide: 1, overlay: 0 },
            2: { logicalSlide: 1, overlay: 1 },
          },
        },
        { 1: 1_000 },
      ),
    ).toEqual([{ label: "1. Reveal", level: 1, milliseconds: 1_000 }]);
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

  it("keeps the heading level on every overlay", () => {
    expect(headingForPage(deck, 2)?.level).toBe(1);
  });

  it("lists the completed overlay once and keeps hidden pages", () => {
    const deckWithHiddenOverlay: Metadata = {
      ...deck,
      slides: {
        ...deck.slides,
        3: { logicalSlide: 1, overlay: 2, hidden: true },
        5: { hidden: true },
      },
    };

    expect(completedSlidePage(deckWithHiddenOverlay, 1)).toBe(3);
    expect(overviewPages(deckWithHiddenOverlay)).toEqual([3, 4, 5]);
    expect(logicalSlideStartPage(deckWithHiddenOverlay, 3)).toBe(1);
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
    expect(
      presentationPace({ ...deckWithAppendix, durationMinutes: 30 }, 6, 0),
    ).toBeUndefined();
  });

  it("compares elapsed time with logical slide pace", () => {
    const timedDeck = { ...deck, durationMinutes: 30 };
    expect(presentationPace(timedDeck, 1, 0)).toEqual({
      status: "ahead",
      differenceSeconds: -300,
    });
    expect(presentationPace(timedDeck, 2, 300)).toEqual({
      status: "on-pace",
      differenceSeconds: 0,
    });
    expect(presentationPace(timedDeck, 4, 1_000)).toEqual({
      status: "behind",
      differenceSeconds: 100,
    });
    expect(presentationPace(timedDeck, 4, 839)?.status).toBe("ahead");
    expect(presentationPace(timedDeck, 4, 840)?.status).toBe("on-pace");
    expect(presentationPace(timedDeck, 4, 960)?.status).toBe("on-pace");
    expect(presentationPace(timedDeck, 4, 961)?.status).toBe("behind");
    expect(
      presentationPace(
        {
          ...timedDeck,
          slides: { ...timedDeck.slides, 4: { hidden: true } },
        },
        4,
        0,
      ),
    ).toBeUndefined();
    expect(presentationPace(deck, 1, 0)).toBeUndefined();
  });
});

describe("scheduled presentation time", () => {
  it("derives duration across midnight", () => {
    expect(
      presentationDurationMinutes({
        ...metadata,
        durationMinutes: 5,
        startTime: "14:10",
        endTime: "14:40",
      }),
    ).toBe(30);
    expect(
      presentationDurationMinutes({
        ...metadata,
        startTime: "23:50",
        endTime: "00:20",
      }),
    ).toBe(30);
  });

  it("resolves the next occurrence of a start time", () => {
    const now = new Date(2026, 0, 1, 14, 0, 30).getTime();
    expect(presentationStartAt({ ...metadata, startTime: "14:10" }, now)).toBe(
      new Date(2026, 0, 1, 14, 10).getTime(),
    );
    expect(presentationStartAt({ ...metadata, startTime: "13:50" }, now)).toBe(
      new Date(2026, 0, 2, 13, 50).getTime(),
    );
    expect(presentationStartAt({ ...metadata, startTime: "14:00" }, now)).toBe(
      new Date(2026, 0, 1, 14, 0).getTime(),
    );
  });

  it("derives a start time from end time and duration", () => {
    const now = new Date(2026, 0, 1, 14, 0).getTime();
    expect(
      presentationStartAt(
        { ...metadata, durationMinutes: 30, endTime: "15:00" },
        now,
      ),
    ).toBe(new Date(2026, 0, 1, 14, 30).getTime());
    expect(presentationStartAt({ ...metadata, endTime: "15:00" }, now)).toBe(
      undefined,
    );
  });
});

describe("presentation controls", () => {
  it("applies erasers only to earlier pen strokes", () => {
    const first = {
      kind: "pen" as const,
      color: "#f00",
      page: 1,
      size: 1,
      points: [{ x: 0, y: 0 }],
    };
    const eraser = {
      kind: "eraser" as const,
      page: 1,
      size: 1.5,
      points: [{ x: 0.5, y: 0.5 }],
    };
    const second = { ...first, color: "#0f0" };

    expect(drawingLayers([first, eraser, second])).toEqual([
      { index: 0, stroke: first, erasers: [eraser] },
      { index: 2, stroke: second, erasers: [] },
    ]);
  });

  it("formats elapsed time", () => {
    expect(formatElapsedTime(0)).toBe("00:00:00");
    expect(formatElapsedTime(3661)).toBe("01:01:01");
  });

  it("formats remaining time and overtime", () => {
    expect(remainingSeconds(30, 25 * 60)).toBe(5 * 60);
    expect(formatRemainingTime(5 * 60)).toBe("−00:05:00");
    expect(formatRemainingTime(0)).toBe("−00:00:00");
    expect(formatRemainingTime(-1)).toBe("+00:00:01");
  });

  it.each([
    ["ArrowLeft", false, "previous"],
    ["ArrowUp", false, "previous"],
    ["PageUp", false, "previous"],
    ["PageUp", true, undefined],
    ["ArrowRight", false, "next"],
    ["ArrowDown", false, "next"],
    ["PageDown", false, "next"],
    ["PageDown", true, undefined],
    ["Space", false, "next"],
    ["Space", true, "history-forward"],
    ["Enter", false, "next"],
    ["NumpadEnter", false, "next"],
    ["Enter", true, undefined],
    ["Backspace", false, "previous"],
    ["Backspace", true, "history-back"],
    ["Home", false, "first"],
    ["Home", true, undefined],
    ["End", false, "last"],
    ["End", true, undefined],
    ["KeyM", true, "saved"],
    ["KeyM", false, "bookmark"],
    ["KeyP", false, "toggle-timer"],
    ["KeyP", true, undefined],
    ["KeyS", false, "start-timer"],
    ["KeyS", true, undefined],
    ["KeyB", false, "blackout"],
    ["KeyW", false, "whiteout"],
    ["KeyF", true, "toggle-freeze"],
    ["KeyF", false, undefined],
    ["KeyA", true, "toggle-current-slide-size"],
    ["KeyA", false, undefined],
    ["KeyD", false, "toggle-drawings"],
    ["KeyC", false, "clear-drawings"],
    ["Digit1", false, "normal-mode"],
    ["Digit2", false, "laser-mode"],
    ["Digit3", false, "pen-mode"],
    ["Digit4", false, "eraser-mode"],
    ["Digit5", false, "spotlight-mode"],
    ["Escape", false, "reset-view"],
    ["KeyO", false, "overview"],
    ["KeyO", true, undefined],
    ["Equal", false, "input-larger"],
    ["Equal", true, "input-larger"],
    ["NumpadAdd", false, "input-larger"],
    ["Minus", false, "input-smaller"],
    ["NumpadSubtract", false, "input-smaller"],
    ["Slash", true, "shortcuts"],
    ["Slash", false, "search"],
  ] as const)("maps %s (shift: %s)", (code, shiftKey, expected) => {
    expect(
      actionForKey({ code, shiftKey, repeat: false, isComposing: false }),
    ).toBe(expected);
  });

  it("maps the browser search shortcut without stealing other modifiers", () => {
    expect(actionForKey({ code: "KeyK", ctrlKey: true })).toBe("search");
    expect(actionForKey({ code: "KeyK", metaKey: true })).toBe("search");
    expect(actionForKey({ code: "ArrowRight", ctrlKey: true })).toBeUndefined();
    expect(actionForKey({ code: "ArrowRight", altKey: true })).toBeUndefined();
    expect(actionForKey({ code: "KeyZ", ctrlKey: true })).toBe("undo-drawing");
    expect(actionForKey({ code: "KeyZ", metaKey: true, shiftKey: true })).toBe(
      "redo-drawing",
    );
    expect(actionForKey({ code: "KeyY", ctrlKey: true })).toBe("redo-drawing");
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
