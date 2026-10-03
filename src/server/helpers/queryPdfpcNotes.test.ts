import path from "node:path";
import { describe, expect, it } from "vitest";
import { queryPdfpcNotes } from "./queryPdfpcNotes";

describe("queryPdfpcNotes", () => {
  it("reads direct Typst metadata", () => {
    const root = process.cwd();
    expect(
      queryPdfpcNotes(path.join(root, "tests/fixtures/pdfpc-note.typ"), root),
    ).toEqual([{ page: 1, speakerNotes: "Explain this result." }]);
  });

  it("reads Touying speaker notes from shared pdfpc metadata", () => {
    const root = process.cwd();
    expect(
      queryPdfpcNotes(path.join(root, "tests/fixtures/touying.typ"), root),
    ).toEqual([
      {
        page: 2,
        speakerNotes: "Explain that typdeck reuses the existing note.",
      },
    ]);
  });
});
