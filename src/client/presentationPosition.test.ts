import { describe, expect, it } from "vitest";
import type { Metadata } from "./types/metadata";
import {
  presentationPace,
  presentationPosition,
  presentationPositionLabel,
} from "./presentation";

describe("presentationPosition", () => {
  const metadata: Metadata = {
    pageCount: 6,
    durationMinutes: 6,
    outline: [],
    slides: {
      1: { logicalSlide: 1, overlay: 0 },
      2: { logicalSlide: 1, overlay: 1, hidden: true },
      3: { logicalSlide: 1, overlay: 2 },
      4: { logicalSlide: 2, overlay: 0, endSlide: true },
      5: { logicalSlide: 3, overlay: 0 },
      6: { hidden: true },
    },
  };

  it("counts visible steps through the end slide", () => {
    expect(presentationPosition(metadata, 3)).toEqual({
      slide: 1,
      slideCount: 2,
      step: 2,
      stepCount: 2,
    });
    expect(presentationPosition(metadata, 4)).toEqual({
      slide: 2,
      slideCount: 2,
    });
    expect(presentationPosition(metadata, 5)).toBeUndefined();
    expect(presentationPositionLabel(metadata, 3)).toBe(
      "Slide 1 of 2\nStep 2 of 2",
    );
    expect(presentationPace(metadata, 5, 0)).toBeUndefined();
  });
});
