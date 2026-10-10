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
      { text: "Introduction", label: "introduction", page: 1 },
      { text: "Outline-only heading", label: undefined, page: 1 },
      { text: "An inserted page", label: undefined, page: 2 },
      { text: "Typst's Details", label: "details", page: 3 },
      { text: "Rich details", label: undefined, page: 3 },
      { text: "First second", label: undefined, page: 3 },
    ]);
  });
});
