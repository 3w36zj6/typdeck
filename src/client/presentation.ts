import type { Metadata } from "./types/metadata";

export const pageLabel = (metadata: Metadata, page: number): string => {
  const title = metadata.outline?.find(
    (heading) => heading.page === page,
  )?.text;
  return title ? `${page}. ${title}` : `Page ${page}`;
};
