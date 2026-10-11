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

  it("joins multiple Touying speaker notes", async () => {
    const root = process.cwd();
    await expect(
      queryPdfpcNotes(path.join(root, "tests/fixtures/touying.typ"), root),
    ).resolves.toEqual([
      {
        page: 2,
        speakerNotes:
          "Explain that typdeck reuses the existing note.\n\nThen show that multiple notes are preserved.",
      },
    ]);
  });

  it("reads Touying speaker notes on every overlay", async () => {
    const root = process.cwd();
    await expect(
      queryPdfpcNotes(
        path.join(root, "tests/fixtures/touying-overlay.typ"),
        root,
      ),
    ).resolves.toEqual([
      { page: 1, speakerNotes: "Explain every overlay step." },
      { page: 2, speakerNotes: "Explain every overlay step." },
      { page: 3, speakerNotes: "Explain every overlay step." },
    ]);
  });

  it("reads Polylux speaker notes on every overlay", async () => {
    const root = process.cwd();
    await expect(
      queryPdfpcNotes(
        path.join(root, "tests/fixtures/polylux-overlay.typ"),
        root,
      ),
    ).resolves.toEqual([
      { page: 1, speakerNotes: "Explain every overlay step." },
      { page: 2, speakerNotes: "Explain every overlay step." },
      { page: 3, speakerNotes: "Explain every overlay step." },
    ]);
  });
});
