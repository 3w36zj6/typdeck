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

export const slideRectFromPoints = (
  start: SlidePoint,
  end: SlidePoint,
): SlideRect => ({
  x: Math.min(start.x, end.x),
  y: Math.min(start.y, end.y),
  width: Math.abs(end.x - start.x),
  height: Math.abs(end.y - start.y),
});

export const drawingLayers = (strokes: DrawingStroke[]) =>
  strokes.flatMap((stroke, index) =>
    stroke.kind === "pen"
      ? [
          {
            index,
            stroke,
            erasers: strokes
              .slice(index + 1)
              .filter(({ kind }) => kind === "eraser"),
          },
        ]
      : [],
  );
