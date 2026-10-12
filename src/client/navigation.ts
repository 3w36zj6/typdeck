import type { Metadata } from "./types/metadata";

export const adjacentVisiblePage = (
  metadata: Metadata,
  page: number,
  direction: -1 | 1,
): number => {
  for (
    let candidate = page + direction;
    candidate >= 1 && candidate <= metadata.pageCount;
    candidate += direction
  ) {
    if (!metadata.slides?.[`${candidate}`]?.hidden) return candidate;
  }
  return Math.min(Math.max(page, 1), metadata.pageCount);
};

export const jumpVisiblePages = (
  metadata: Metadata,
  page: number,
  direction: -1 | 1,
): number => {
  let target = page;
  for (let step = 0; step < 10; step += 1) {
    const next = adjacentVisiblePage(metadata, target, direction);
    if (next === target) break;
    target = next;
  }
  return target;
};

export const horizontalSwipeDirection = (
  deltaX: number,
  deltaY: number,
  width: number,
): -1 | 1 | undefined => {
  const distance = Math.abs(deltaX);
  if (distance <= Math.abs(deltaY) || distance <= Math.min(75, width * 0.3)) {
    return;
  }
  return deltaX < 0 ? 1 : -1;
};

const decodeHash = (hash: string): string => {
  try {
    return decodeURIComponent(hash.replace(/^#/, ""));
  } catch {
    return "";
  }
};

export const pageFromHash = (hash: string, metadata?: Metadata): number => {
  const value = decodeHash(hash);
  const page = /^[1-9]\d*$/.test(value) ? Number(value) : undefined;
  if (page !== undefined && (!metadata || page <= metadata.pageCount)) {
    return page;
  }

  const firstVisiblePage = metadata && adjacentVisiblePage(metadata, 0, 1);

  return (
    metadata?.outline.find((heading) => heading.label === value)?.page ??
    firstVisiblePage ??
    1
  );
};

export const hashForPage = (page: number, metadata?: Metadata): string => {
  const headingLabel = metadata?.outline.find(
    (heading) =>
      heading.page === page &&
      heading.label &&
      !/^[1-9]\d*$/.test(heading.label),
  )?.label;
  return `#${encodeURIComponent(headingLabel ?? String(page))}`;
};
