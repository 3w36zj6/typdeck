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
  const page = /^[1-9]\d*$/.test(value) ? Number(value) : undefined;
  if (page !== undefined && (!metadata || page <= metadata.pageCount)) {
    return page;
  }

  return (
    metadata?.outline.find((heading) => heading.label === value)?.page ?? 1
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
