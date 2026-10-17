import { describe, expect, it } from "vitest";
import { drawingTree, slideRectFromPoints } from "./drawing";

describe("slideRectFromPoints", () => {
  it("normalizes a drag in either direction", () => {
    const rect = slideRectFromPoints({ x: 0.8, y: 0.7 }, { x: 0.2, y: 0.3 });
    expect(rect.x).toBe(0.2);
    expect(rect.y).toBe(0.3);
    expect(rect.width).toBeCloseTo(0.6);
    expect(rect.height).toBeCloseTo(0.4);
  });
});

describe("drawingTree", () => {
  it("preserves stroke order without duplicating erasers", () => {
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
    const third = { ...first, color: "#00f" };

    expect(drawingTree([first, second, eraser, third])).toEqual({
      index: 3,
      previous: {
        index: 2,
        previous: {
          index: 1,
          previous: { index: 0, previous: null, stroke: first },
          stroke: second,
        },
        stroke: eraser,
      },
      stroke: third,
    });
  });
});
