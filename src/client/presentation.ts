import { adjacentVisiblePage } from "./navigation";
import type { Metadata } from "./types/metadata";

export type BlankScreen = "none" | "black" | "white";

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

const overlayPages = (
  metadata: Metadata,
  logicalSlide: number,
  includeHidden = false,
): number[] =>
  Object.entries(metadata.slides ?? {})
    .filter(
      ([, slide]) =>
        slide?.logicalSlide === logicalSlide &&
        slide.overlay !== undefined &&
        (includeHidden || !slide.hidden),
    )
    .sort(([, left], [, right]) => (left?.overlay ?? 0) - (right?.overlay ?? 0))
    .map(([page]) => Number(page));

export const headingForPage = (metadata: Metadata, page: number) => {
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

export const logicalSlideStartPage = (
  metadata: Metadata,
  page: number,
): number => {
  const logicalSlide = metadata.slides?.[`${page}`]?.logicalSlide;
  return logicalSlide === undefined
    ? page
    : (overlayPages(metadata, logicalSlide)[0] ?? page);
};

export const completedSlidePage = (
  metadata: Metadata,
  page: number,
): number => {
  const logicalSlide = metadata.slides?.[`${page}`]?.logicalSlide;
  if (logicalSlide === undefined) return page;
  const pages = overlayPages(metadata, logicalSlide, true);
  return pages[pages.length - 1] ?? page;
};

export const overviewPages = (metadata: Metadata): number[] => {
  const logicalSlides = new Set<number>();
  return Array.from({ length: metadata.pageCount }, (_, index) => index + 1)
    .filter((page) => {
      const logicalSlide = metadata.slides?.[`${page}`]?.logicalSlide;
      if (logicalSlide === undefined) return true;
      if (logicalSlides.has(logicalSlide)) return false;
      logicalSlides.add(logicalSlide);
      return true;
    })
    .map((page) => completedSlidePage(metadata, page));
};

export type SlideTimingState = {
  page: number;
  elapsedMilliseconds: number;
  durations: Record<number, number>;
};

export const updateSlideTiming = (
  metadata: Metadata,
  state: SlideTimingState,
  page: number,
  elapsedMilliseconds: number,
): SlideTimingState => {
  const elapsed = Math.max(state.elapsedMilliseconds, elapsedMilliseconds);
  const duration = elapsed - state.elapsedMilliseconds;
  if (duration === 0 && page === state.page) return state;
  const timingPage = logicalSlideStartPage(metadata, state.page);
  return {
    page,
    elapsedMilliseconds: elapsed,
    durations:
      duration === 0
        ? state.durations
        : {
            ...state.durations,
            [timingPage]: (state.durations[timingPage] ?? 0) + duration,
          },
  };
};

export type TimingBreakdownRow = {
  label: string;
  level: number;
  milliseconds: number;
};

export const timingBreakdownRows = (
  metadata: Metadata,
  durations: Record<number, number>,
): TimingBreakdownRow[] => {
  const timedPages = Object.entries(durations)
    .map(([page, milliseconds]) => ({ page: Number(page), milliseconds }))
    .filter(({ milliseconds }) => milliseconds > 0)
    .sort((left, right) => left.page - right.page);
  const outline = metadata.outline
    .map((heading) => ({
      ...heading,
      page: logicalSlideStartPage(metadata, heading.page),
    }))
    .filter(
      (heading, index, headings) =>
        headings.findIndex(
          (candidate) =>
            candidate.page === heading.page &&
            candidate.level === heading.level &&
            candidate.text === heading.text,
        ) === index,
    );
  const minimumLevel =
    outline.length > 0 ? Math.min(...outline.map(({ level }) => level)) : 1;
  const endPage = (index: number) =>
    outline.slice(index + 1).find(({ level }) => level <= outline[index]!.level)
      ?.page ?? metadata.pageCount + 1;
  const headings = outline.flatMap((heading, index) => {
    const end = endPage(index);
    const milliseconds = timedPages
      .filter(({ page }) => page >= heading.page && page < end)
      .reduce((total, timing) => total + timing.milliseconds, 0);
    return milliseconds > 0
      ? [
          {
            page: heading.page,
            order: index,
            label: `${heading.page}. ${heading.text}`,
            level: heading.level - minimumLevel + 1,
            milliseconds,
          },
        ]
      : [];
  });
  const headingPages = new Set(outline.map(({ page }) => page));
  const fallback = timedPages.flatMap(({ page, milliseconds }) => {
    if (headingPages.has(page)) return [];
    const parent = outline.findLast(
      (heading, index) => heading.page <= page && page < endPage(index),
    );
    return [
      {
        page,
        order: Number.POSITIVE_INFINITY,
        label: pageLabel(metadata, page),
        level: parent ? parent.level - minimumLevel + 2 : 1,
        milliseconds,
      },
    ];
  });
  return [...headings, ...fallback]
    .sort((left, right) => left.page - right.page || left.order - right.order)
    .map(({ label, level, milliseconds }) => ({
      label,
      level,
      milliseconds,
    }));
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
  if (logicalSlide === undefined) return page;
  const pages = overlayPages(metadata, logicalSlide);
  return pages[pages.length - 1] ?? page;
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
  const overlays = overlayPages(metadata, slide.logicalSlide);
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

export const adjacentLogicalSlidePage = (
  metadata: Metadata,
  page: number,
  direction: -1 | 1,
): number => {
  const pages = overviewPages(metadata)
    .map((candidate) => logicalSlideStartPage(metadata, candidate))
    .filter((candidate) => !metadata.slides?.[`${candidate}`]?.hidden);
  const index = pages.indexOf(logicalSlideStartPage(metadata, page));
  const target =
    index >= 0
      ? pages[index + direction]
      : direction === 1
        ? pages.find((candidate) => candidate > page)
        : pages.findLast((candidate) => candidate < page);
  return target ?? page;
};
