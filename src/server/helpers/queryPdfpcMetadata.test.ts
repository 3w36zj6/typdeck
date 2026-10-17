import path from "node:path";
import { describe, expect, it } from "vitest";
import { queryPdfpcMetadata } from "./queryPdfpcMetadata";

describe("queryPdfpcMetadata", () => {
  it("reads direct Typst notes", async () => {
    const root = process.cwd();
    await expect(
      queryPdfpcMetadata(
        path.join(root, "tests/fixtures/pdfpc-note.typ"),
        root,
      ),
    ).resolves.toEqual({
      durationMinutes: 30,
      startTime: "14:10",
      endTime: "14:40",
      lastMinutes: 5,
      disableMarkdown: false,
      slides: [{ page: 1, speakerNotes: "Explain this result." }],
    });
  });

  it("joins multiple Touying speaker notes", async () => {
    const root = process.cwd();
    const metadata = await queryPdfpcMetadata(
      path.join(root, "tests/fixtures/touying.typ"),
      root,
    );
    expect(metadata.slides).toContainEqual({
      page: 2,
      logicalSlide: 1,
      overlay: 0,
      speakerNotes:
        "Explain that typdeck reuses the existing note.\n\nThen show that multiple notes are preserved.",
    });
  });

  it("reads Touying overlay groups and speaker notes", async () => {
    const root = process.cwd();
    await expect(
      queryPdfpcMetadata(
        path.join(root, "tests/fixtures/touying-overlay.typ"),
        root,
      ).then(({ slides }) => slides),
    ).resolves.toEqual([
      {
        page: 1,
        logicalSlide: 1,
        overlay: 0,
        savedSlide: true,
        speakerNotes: "Explain every overlay step.",
      },
      {
        page: 2,
        logicalSlide: 1,
        overlay: 1,
        savedSlide: true,
        speakerNotes: "Explain every overlay step.",
      },
      {
        page: 3,
        logicalSlide: 1,
        overlay: 2,
        savedSlide: true,
        speakerNotes: "Explain every overlay step.",
      },
      { page: 4, logicalSlide: 2, overlay: 0, endSlide: true },
    ]);
  });

  it("reads Polylux overlay groups and speaker notes", async () => {
    const root = process.cwd();
    await expect(
      queryPdfpcMetadata(
        path.join(root, "tests/fixtures/polylux-overlay.typ"),
        root,
      ).then(({ slides }) => slides),
    ).resolves.toEqual([
      {
        page: 1,
        logicalSlide: 1,
        overlay: 0,
        savedSlide: true,
        speakerNotes: "Explain every overlay step.",
      },
      {
        page: 2,
        logicalSlide: 1,
        overlay: 1,
        savedSlide: true,
        speakerNotes: "Explain every overlay step.",
      },
      {
        page: 3,
        logicalSlide: 1,
        overlay: 2,
        savedSlide: true,
        speakerNotes: "Explain every overlay step.",
      },
      { page: 4, logicalSlide: 2, overlay: 0, endSlide: true },
    ]);
  });

  it("reads hidden slides and ignores a zero duration", async () => {
    const root = process.cwd();
    await expect(
      queryPdfpcMetadata(
        path.join(root, "tests/fixtures/pdfpc-hidden.typ"),
        root,
      ),
    ).resolves.toEqual({ slides: [{ page: 2, hidden: true }] });
  });

  it("rejects incomplete overlay metadata", async () => {
    const root = process.cwd();
    await expect(
      queryPdfpcMetadata(
        path.join(root, "tests/fixtures/pdfpc-incomplete-overlay.typ"),
        root,
      ),
    ).rejects.toThrow("Page 1 must provide LogicalSlide and Overlay together");
  });
});
