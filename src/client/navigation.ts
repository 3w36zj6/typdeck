import type { Metadata } from "./types/metadata";

const decodeHash = (hash: string): string => {
  try {
    return decodeURIComponent(hash.replace(/^#/, ""));
  } catch {
    return "";
  }
};

export const pageFromHash = (hash: string, metadata?: Metadata): number => {
  const value = decodeHash(hash);
  if (/^[1-9]\d*$/.test(value)) return Number(value);

  return (
    metadata?.outline.find((heading) => heading.label === value)?.page ?? 1
  );
};

export const hashForPage = (page: number, metadata?: Metadata): string => {
  const headingLabel = metadata?.outline.find(
    (heading) => heading.page === page && heading.label,
  )?.label;
  return `#${encodeURIComponent(headingLabel ?? String(page))}`;
};
