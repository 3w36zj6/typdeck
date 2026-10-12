import { describe, expect, it } from "vitest";
import { drawingLayers, slideRectFromPoints } from "./drawing";

describe("slideRectFromPoints", () => {
  it("normalizes a drag in either direction", () => {
    const rect = slideRectFromPoints({ x: 0.8, y: 0.7 }, { x: 0.2, y: 0.3 });
    expect(rect.x).toBe(0.2);
    expect(rect.y).toBe(0.3);
    expect(rect.width).toBeCloseTo(0.6);
    expect(rect.height).toBeCloseTo(0.4);
  });
});

describe("drawingLayers", () => {
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
});
