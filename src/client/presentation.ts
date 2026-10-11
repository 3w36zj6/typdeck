import { adjacentVisiblePage } from "./navigation";
import type { Metadata } from "./types/metadata";

export const actionForKey = ({
  code,
  shiftKey,
  repeat,
  isComposing,
}: Pick<KeyboardEvent, "code" | "shiftKey" | "repeat" | "isComposing">) => {
  if (repeat || isComposing) return;
  switch (code) {
    case "ArrowLeft":
    case "ArrowUp":
      return "previous";
    case "ArrowRight":
    case "ArrowDown":
      return "next";
    case "End":
      return "last";
    case "KeyM":
      return shiftKey ? "saved" : undefined;
    case "KeyB":
      return "blackout";
    case "Slash":
      return shiftKey ? "shortcuts" : undefined;
  }
};

export const formatElapsedTime = (seconds: number): string => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;
  return [hours, minutes, remainingSeconds]
    .map((value) => value.toString().padStart(2, "0"))
    .join(":");
};

const visibleOverlayPages = (
  metadata: Metadata,
  logicalSlide: number,
): number[] =>
  Object.entries(metadata.slides ?? {})
    .filter(
      ([, slide]) =>
        slide?.logicalSlide === logicalSlide &&
        slide.overlay !== undefined &&
        !slide.hidden,
    )
    .sort(([, left], [, right]) => (left?.overlay ?? 0) - (right?.overlay ?? 0))
    .map(([page]) => Number(page));

const headingForPage = (metadata: Metadata, page: number) => {
  const logicalSlide = metadata.slides?.[`${page}`]?.logicalSlide;
  return metadata.outline.find(
    (heading) =>
      heading.page === page ||
      (logicalSlide !== undefined &&
        metadata.slides?.[`${heading.page}`]?.logicalSlide === logicalSlide),
  );
};

export const pageLabel = (metadata: Metadata, page: number): string => {
  const title = headingForPage(metadata, page)?.text;
  const number = metadata.pageLabels?.[page - 1] ?? String(page);
  return title ? `${number}. ${title}` : `Page ${number}`;
};

const logicalSlideStartPage = (metadata: Metadata, page: number): number => {
  const logicalSlide = metadata.slides?.[`${page}`]?.logicalSlide;
  return logicalSlide === undefined
    ? page
    : (visibleOverlayPages(metadata, logicalSlide)[0] ?? page);
};

const markedSlidePage = (
  metadata: Metadata,
  marker: "endSlide" | "savedSlide",
): number | undefined => {
  for (let page = 1; page <= metadata.pageCount; page += 1) {
    const slide = metadata.slides?.[`${page}`];
    if (!slide?.[marker]) continue;
    return logicalSlideStartPage(metadata, page);
  }
};

export const endSlidePage = (metadata: Metadata): number =>
  markedSlidePage(metadata, "endSlide") ??
  adjacentVisiblePage(metadata, metadata.pageCount + 1, -1);

export const savedSlidePage = (metadata: Metadata): number | undefined =>
  markedSlidePage(metadata, "savedSlide");

export const previousPresentationPage = (
  metadata: Metadata,
  page: number,
): number => {
  const previous = adjacentVisiblePage(metadata, page, -1);
  if (
    metadata.slides?.[`${page}`]?.logicalSlide ===
    metadata.slides?.[`${previous}`]?.logicalSlide
  ) {
    return previous;
  }
  return logicalSlideStartPage(metadata, previous);
};

const completedVisibleSlidePage = (
  metadata: Metadata,
  page: number,
): number => {
  const logicalSlide = metadata.slides?.[`${page}`]?.logicalSlide;
  return logicalSlide === undefined
    ? page
    : (visibleOverlayPages(metadata, logicalSlide).at(-1) ?? page);
};

export const nextPreviewPage = (metadata: Metadata, page: number): number => {
  const current = metadata.slides?.[`${page}`];
  const completed = completedVisibleSlidePage(metadata, page);
  const completedOverlay = metadata.slides?.[`${completed}`]?.overlay;
  if (
    current?.overlay !== undefined &&
    completedOverlay !== undefined &&
    current.overlay < completedOverlay
  ) {
    return completed;
  }
  const next = adjacentVisiblePage(metadata, page, 1);
  return completedVisibleSlidePage(metadata, next);
};

export const presentationPositionLabel = (
  metadata: Metadata,
  page: number,
): string => {
  if (metadata.slides?.[`${page}`]?.hidden) {
    return `Page ${page} of ${metadata.pageCount} (hidden)`;
  }

  const slideKeys = new Set<string>();
  for (let candidate = 1; candidate <= metadata.pageCount; candidate += 1) {
    const slide = metadata.slides?.[`${candidate}`];
    if (slide?.hidden) continue;
    const key =
      slide?.logicalSlide === undefined
        ? `page:${candidate}`
        : `logical:${slide.logicalSlide}`;
    slideKeys.add(key);
  }

  const slide = metadata.slides?.[`${page}`];
  const key =
    slide?.logicalSlide === undefined
      ? `page:${page}`
      : `logical:${slide.logicalSlide}`;
  const slides = [...slideKeys];
  const position = slides.indexOf(key) + 1;
  if (position === 0) return `Page ${page} of ${metadata.pageCount}`;

  if (slide?.logicalSlide === undefined) {
    return `Slide ${position} of ${slides.length}`;
  }
  const overlays = visibleOverlayPages(metadata, slide.logicalSlide);
  const step = overlays.indexOf(page) + 1;
  return overlays.length > 1 && step > 0
    ? `Slide ${position} of ${slides.length}\nStep ${step} of ${overlays.length}`
    : `Slide ${position} of ${slides.length}`;
};
