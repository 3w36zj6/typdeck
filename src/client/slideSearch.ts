import type { Metadata } from "./types/metadata";

export const MAX_SEARCH_QUERY_LENGTH = 200;

export type SearchableSlide = {
  page: number;
  logicalSlide?: number;
  text: string;
};

export type SlideSearchResult = SearchableSlide & {
  excerpt: string;
  score: number;
};

type SearchDocument = {
  numPages: number;
  getPage(page: number): Promise<{
    getTextContent(): Promise<{ items: readonly object[] }>;
  }>;
};

const SEARCH_INDEX_BATCH_SIZE = 4;

export const indexSlideText = async (
  document: SearchDocument,
  metadata: Metadata,
): Promise<SearchableSlide[]> => {
  const pages = Array.from(
    { length: document.numPages },
    (_, index) => index + 1,
  );
  const indexPage = async (page: number): Promise<SearchableSlide> => {
    const content = await (await document.getPage(page)).getTextContent();
    return {
      page,
      logicalSlide: metadata.slides?.[`${page}`]?.logicalSlide,
      text: content.items
        .map((item) =>
          "str" in item && typeof item.str === "string"
            ? `${item.str}${"hasEOL" in item && item.hasEOL ? "\n" : " "}`
            : "",
        )
        .join(""),
    };
  };
  const indexFrom = async (offset: number): Promise<SearchableSlide[]> => {
    if (offset >= pages.length) return [];
    const batch = await Promise.all(
      pages.slice(offset, offset + SEARCH_INDEX_BATCH_SIZE).map(indexPage),
    );
    return batch.concat(await indexFrom(offset + SEARCH_INDEX_BATCH_SIZE));
  };

  return indexFrom(0);
};

export const normalizeSearchText = (text: string) =>
  text.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();

const fuzzyMatch = (text: string, query: string) => {
  const exact = text.indexOf(query);
  if (exact >= 0) return { score: 0, index: exact };

  const maximumDistance = Math.floor(query.length / 4);
  if (maximumDistance === 0) return;

  let previous = Uint32Array.from(
    { length: query.length + 1 },
    (_, index) => index,
  );
  let current = new Uint32Array(query.length + 1);
  let bestScore = maximumDistance + 1;
  let bestEnd = 0;

  for (let textIndex = 0; textIndex < text.length; textIndex += 1) {
    current[0] = 0;
    for (let queryIndex = 1; queryIndex <= query.length; queryIndex += 1) {
      current[queryIndex] = Math.min(
        previous[queryIndex]! + 1,
        current[queryIndex - 1]! + 1,
        previous[queryIndex - 1]! +
          (query[queryIndex - 1] === text[textIndex] ? 0 : 1),
      );
    }
    const score = current[query.length]!;
    if (score < bestScore) {
      bestScore = score;
      bestEnd = textIndex + 1;
    }
    [previous, current] = [current, previous];
  }

  if (bestScore > maximumDistance) return;
  return { score: bestScore, index: Math.max(0, bestEnd - query.length) };
};

const excerptAround = (text: string, index: number) => {
  const start = Math.max(0, index - 50);
  const end = Math.min(text.length, index + 110);
  return `${start > 0 ? "…" : ""}${text.slice(start, end)}${end < text.length ? "…" : ""}`;
};

export const searchSlides = (
  slides: SearchableSlide[],
  input: string,
): SlideSearchResult[] => {
  const query = normalizeSearchText(input);
  if (query.length < 2 || query.length > MAX_SEARCH_QUERY_LENGTH) return [];

  const matches = slides.flatMap((slide) => {
    const displayText = slide.text.replace(/\s+/g, " ").trim();
    const text = normalizeSearchText(displayText);
    const match = fuzzyMatch(text, query);
    return match
      ? [
          {
            ...slide,
            excerpt: excerptAround(displayText, match.index),
            score: match.score,
          },
        ]
      : [];
  });
  const bestBySlide = new Map<string, SlideSearchResult>();
  for (const match of matches) {
    const key =
      match.logicalSlide === undefined
        ? `page:${match.page}`
        : `slide:${match.logicalSlide}`;
    const previous = bestBySlide.get(key);
    if (
      !previous ||
      match.score < previous.score ||
      (match.score === previous.score && match.page > previous.page)
    ) {
      bestBySlide.set(key, match);
    }
  }
  return [...bestBySlide.values()].sort(
    (left, right) => left.score - right.score || left.page - right.page,
  );
};
