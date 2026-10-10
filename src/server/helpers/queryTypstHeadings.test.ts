import path from "node:path";
import { describe, expect, it } from "vitest";
import { queryTypstHeadings } from "./queryTypstHeadings";

describe("queryTypstHeadings", () => {
  it("reads outline text, labels, and physical pages", async () => {
    const root = process.cwd();
    const headings = await queryTypstHeadings(
      path.join(root, "tests/fixtures/headings.typ"),
      root,
    );

    expect(headings).toEqual([
      { text: "Introduction", label: "introduction", level: 1, page: 1 },
      { text: "Nested detail", label: undefined, level: 2, page: 1 },
      {
        text: "Outline-only heading",
        label: undefined,
        level: 1,
        page: 1,
      },
      { text: "An inserted page", label: undefined, level: 1, page: 2 },
      { text: "Typst's Details", label: "details", level: 1, page: 3 },
      { text: "Rich details", label: undefined, level: 2, page: 3 },
      {
        text: "Code x and a + b link",
        label: undefined,
        level: 2,
        page: 3,
      },
      { text: "First second", label: undefined, level: 2, page: 3 },
    ]);
  });
});
