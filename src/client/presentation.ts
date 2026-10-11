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
    case "PageUp":
      return shiftKey ? undefined : "previous";
    case "ArrowRight":
    case "ArrowDown":
      return "next";
    case "PageDown":
    case "Space":
      return shiftKey ? undefined : "next";
    case "Enter":
    case "NumpadEnter":
      return shiftKey ? undefined : "next";
    case "Backspace":
      return shiftKey ? undefined : "previous";
    case "Home":
      return shiftKey ? undefined : "first";
    case "End":
      return shiftKey ? undefined : "last";
    case "KeyM":
      return shiftKey ? "saved" : undefined;
    case "KeyP":
      return shiftKey ? undefined : "toggle-timer";
    case "KeyS":
      return shiftKey ? undefined : "start-timer";
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

export const remainingSeconds = (
  durationMinutes: number,
  elapsedSeconds: number,
): number => Math.round(durationMinutes * 60) - elapsedSeconds;

const clockMinutes = (time: string) =>
  Number(time.slice(0, 2)) * 60 + Number(time.slice(3));

export const presentationDurationMinutes = ({
  durationMinutes,
  startTime,
  endTime,
}: Metadata): number | undefined => {
  if (!startTime || !endTime) return durationMinutes;
  const difference = clockMinutes(endTime) - clockMinutes(startTime);
  return difference > 0 ? difference : difference + 24 * 60;
};

const nextClockTime = (time: string, now: number) => {
  const date = new Date(now);
  const scheduledMinutes = clockMinutes(time);
  const currentMinutes = date.getHours() * 60 + date.getMinutes();
  date.setHours(Math.floor(scheduledMinutes / 60), scheduledMinutes % 60, 0, 0);
  if (scheduledMinutes < currentMinutes) date.setDate(date.getDate() + 1);
  return date.getTime();
};

export const presentationStartAt = (
  metadata: Metadata,
  now: number,
): number | undefined => {
  if (metadata.startTime) return nextClockTime(metadata.startTime, now);
  const duration = presentationDurationMinutes(metadata);
  return metadata.endTime && duration !== undefined
    ? nextClockTime(metadata.endTime, now) - duration * 60_000
    : undefined;
};

export const formatRemainingTime = (seconds: number): string =>
  `${seconds < 0 ? "+" : "−"}${formatElapsedTime(Math.abs(seconds))}`;

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

const slideKey = (metadata: Metadata, page: number): string => {
  const logicalSlide = metadata.slides?.[`${page}`]?.logicalSlide;
  return logicalSlide === undefined
    ? `page:${page}`
    : `logical:${logicalSlide}`;
};

const presentationSections = (metadata: Metadata) => {
  const endPage = endSlidePage(metadata);
  const slides = new Set<string>();
  const appendices = new Set<string>();
  for (let page = 1; page <= metadata.pageCount; page += 1) {
    if (metadata.slides?.[`${page}`]?.hidden) continue;
    const key = slideKey(metadata, page);
    (page <= endPage || slides.has(key) ? slides : appendices).add(key);
  }
  return { slides: [...slides], appendices: [...appendices] };
};

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
    return "Hidden slide";
  }

  const { slides, appendices } = presentationSections(metadata);
  const slide = metadata.slides?.[`${page}`];
  const key = slideKey(metadata, page);
  const position = slides.indexOf(key) + 1;
  const appendixPosition = appendices.indexOf(key) + 1;
  if (position === 0 && appendixPosition === 0) {
    return "Slide";
  }
  const label =
    position > 0
      ? `Slide ${position} of ${slides.length}`
      : `Appendix ${appendixPosition} of ${appendices.length}`;

  if (slide?.logicalSlide === undefined) {
    return label;
  }
  const overlays = visibleOverlayPages(metadata, slide.logicalSlide);
  const step = overlays.indexOf(page) + 1;
  return overlays.length > 1 && step > 0
    ? `${label}\nStep ${step} of ${overlays.length}`
    : label;
};

export const presentationPace = (
  metadata: Metadata,
  page: number,
  elapsedSeconds: number,
) => {
  const durationMinutes = presentationDurationMinutes(metadata);
  if (durationMinutes === undefined || metadata.slides?.[`${page}`]?.hidden) {
    return;
  }
  const slides = presentationSections(metadata).slides;
  const position = slides.indexOf(slideKey(metadata, page)) + 1;
  if (position === 0) return;

  const expectedSeconds =
    (durationMinutes * 60 * (position - 0.5)) / slides.length;
  const differenceSeconds = Math.round(elapsedSeconds - expectedSeconds);
  return {
    status:
      differenceSeconds > 60
        ? "behind"
        : differenceSeconds < -60
          ? "ahead"
          : "on-pace",
    differenceSeconds,
  };
};
