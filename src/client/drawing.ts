export type SlidePoint = { x: number; y: number };
export type SlideRect = SlidePoint & { width: number; height: number };
export type SlideZoom = SlideRect & { page: number };
export type SlidePointer = SlidePoint & {
  kind: "laser" | "spotlight";
  page: number;
  size: number;
};
type DrawingStrokeBase = {
  page: number;
  points: SlidePoint[];
  size: number;
};
export type DrawingStroke = DrawingStrokeBase &
  ({ kind: "pen"; color: string } | { kind: "eraser" });
export type DrawingNode = {
  index: number;
  previous: DrawingNode | null;
  stroke: DrawingStroke;
};

export const slideRectFromPoints = (
  start: SlidePoint,
  end: SlidePoint,
): SlideRect => ({
  x: Math.min(start.x, end.x),
  y: Math.min(start.y, end.y),
  width: Math.abs(end.x - start.x),
  height: Math.abs(end.y - start.y),
});

export const drawingTree = (strokes: DrawingStroke[]) =>
  strokes.reduce<DrawingNode | null>(
    (previous, stroke, index) => ({ index, previous, stroke }),
    null,
  );
