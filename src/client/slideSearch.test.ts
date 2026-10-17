import { describe, expect, it } from "vitest";
import {
  indexSlideText,
  MAX_SEARCH_QUERY_LENGTH,
  normalizeSearchText,
  searchSlides,
} from "./slideSearch";

describe("slide search", () => {
  it("normalizes case, width, and whitespace", () => {
    expect(normalizeSearchText(" Ｔypst\n  Deck ")).toBe("typst deck");
  });

  it("finds exact and misspelled body text", () => {
    const slides = [
      { page: 1, text: "Opening" },
      { page: 2, text: "Semantic presentation compiler" },
    ];

    expect(
      searchSlides(slides, "presentation").map(({ page }) => page),
    ).toEqual([2]);
    expect(searchSlides(slides, "presentaton").map(({ page }) => page)).toEqual(
      [2],
    );
    expect(searchSlides(slides, "presentaton")[0]?.excerpt).toContain(
      "Semantic presentation",
    );
  });

  it("returns one result for each logical slide", () => {
    const results = searchSlides(
      [
        { page: 2, logicalSlide: 1, text: "search target" },
        { page: 3, logicalSlide: 1, text: "search target with conclusion" },
        { page: 4, logicalSlide: 2, text: "another target" },
      ],
      "target",
    );

    expect(results.map(({ page }) => page)).toEqual([3, 4]);
  });

  it("does not return broad one-character matches", () => {
    expect(searchSlides([{ page: 1, text: "Typst" }], "t")).toEqual([]);
  });

  it("does not process overlong queries", () => {
    expect(
      searchSlides(
        [{ page: 1, text: "Typst" }],
        "t".repeat(MAX_SEARCH_QUERY_LENGTH + 1),
      ),
    ).toEqual([]);
  });

  it("indexes at most four pages concurrently", async () => {
    const state = { active: 0, maximum: 0 };
    const slides = await indexSlideText(
      {
        numPages: 9,
        async getPage(page) {
          return {
            async getTextContent() {
              state.active += 1;
              state.maximum = Math.max(state.maximum, state.active);
              await new Promise((resolve) => setTimeout(resolve));
              state.active -= 1;
              return {
                items: [{ str: `Slide ${page}`, hasEOL: false }],
              };
            },
          };
        },
      },
      { pageCount: 9, outline: [] },
    );

    expect(state.maximum).toBe(4);
    expect(slides.map(({ text }) => text.trim())).toEqual(
      Array.from({ length: 9 }, (_, index) => `Slide ${index + 1}`),
    );
  });
});
