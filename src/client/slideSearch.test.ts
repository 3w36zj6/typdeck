import { describe, expect, it } from "vitest";
import { normalizeSearchText, searchSlides } from "./slideSearch";

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
});
