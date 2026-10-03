import path from "node:path";
import { describe, expect, it } from "vitest";
import { queryPdfpcNotes } from "./queryPdfpcNotes";

describe("queryPdfpcNotes", () => {
  it("reads direct Typst metadata", async () => {
    const root = process.cwd();
    await expect(
      queryPdfpcNotes(path.join(root, "tests/fixtures/pdfpc-note.typ"), root),
    ).resolves.toEqual([{ page: 1, speakerNotes: "Explain this result." }]);
  });

  it("reads Touying speaker notes from shared pdfpc metadata", async () => {
    const root = process.cwd();
    await expect(
      queryPdfpcNotes(path.join(root, "tests/fixtures/touying.typ"), root),
    ).resolves.toEqual([
      {
        page: 2,
        speakerNotes: "Explain that typdeck reuses the existing note.",
      },
    ]);
  });
});
