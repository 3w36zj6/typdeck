import { describe, expect, expectTypeOf, it } from "vitest";
import { metadataIdentity, parseMetadata, type Metadata } from "./metadata";

describe("parseMetadata", () => {
  expectTypeOf<
    keyof NonNullable<Metadata["slides"]>
  >().toEqualTypeOf<`${number}`>();

  it("parses the current manifest", () => {
    expect(
      parseMetadata({
        pageCount: 2,
        pageLabels: ["i", "ii"],
        title: "Example deck",
        language: "en-GB",
        durationMinutes: 30,
        startTime: "14:10",
        endTime: "14:40",
        lastMinutes: 0,
        disableMarkdown: false,
        outline: [{ text: "Introduction", label: "intro", level: 1, page: 1 }],
        slides: {
          2: {
            speakerNotes: "Remember this",
            hidden: true,
            endSlide: true,
            savedSlide: true,
            logicalSlide: 1,
            overlay: 0,
          },
        },
      }),
    ).toEqual({
      pageCount: 2,
      pageLabels: ["i", "ii"],
      title: "Example deck",
      language: "en-GB",
      durationMinutes: 30,
      startTime: "14:10",
      endTime: "14:40",
      lastMinutes: 0,
      disableMarkdown: false,
      outline: [{ text: "Introduction", label: "intro", level: 1, page: 1 }],
      slides: {
        2: {
          speakerNotes: "Remember this",
          hidden: true,
          endSlide: true,
          savedSlide: true,
          logicalSlide: 1,
          overlay: 0,
        },
      },
    });
  });

  it("rejects an invalid manifest", () => {
    expect(() => parseMetadata({ pageCount: 1 })).toThrow();
    expect(() => parseMetadata({ pageCount: 0, outline: [] })).toThrow();
    expect(() =>
      parseMetadata({ pageCount: 2, pageLabels: ["1"], outline: [] }),
    ).toThrow();
    expect(() =>
      parseMetadata({ pageCount: 1, title: " ", outline: [] }),
    ).toThrow();
    expect(() =>
      parseMetadata({ pageCount: 1, language: "not_a_language", outline: [] }),
    ).toThrow();
    expect(() =>
      parseMetadata({ pageCount: 1, durationMinutes: 0, outline: [] }),
    ).toThrow();
    expect(() =>
      parseMetadata({ pageCount: 1, startTime: "24:00", outline: [] }),
    ).toThrow();
    expect(() =>
      parseMetadata({ pageCount: 1, lastMinutes: -1, outline: [] }),
    ).toThrow();
    expect(() =>
      parseMetadata({ pageCount: 1, disableMarkdown: "yes", outline: [] }),
    ).toThrow();
    expect(() =>
      parseMetadata({ pageCount: 2, outline: [], slides: { foo: {} } }),
    ).toThrow();
    expect(() =>
      parseMetadata({
        pageCount: 2,
        outline: [{ text: "Outside", level: 1, page: 3 }],
      }),
    ).toThrow();
    expect(() =>
      parseMetadata({ pageCount: 2, outline: [], slides: { 3: {} } }),
    ).toThrow();
    expect(() =>
      parseMetadata({
        pageCount: 2,
        outline: [],
        slides: { 1: { speakerNotes: 1 } },
      }),
    ).toThrow();
    expect(() =>
      parseMetadata({
        pageCount: 1,
        outline: [],
        slides: { 1: { hidden: false } },
      }),
    ).toThrow();
    expect(() =>
      parseMetadata({
        pageCount: 1,
        outline: [],
        slides: { 1: { logicalSlide: 0 } },
      }),
    ).toThrow();
  });
});

describe("metadataIdentity", () => {
  const metadata: Metadata = {
    pageCount: 2,
    outline: [{ text: "Introduction", level: 1, page: 1 }],
    slides: {
      1: { speakerNotes: "Original note", logicalSlide: 0, overlay: 0 },
    },
  };

  it("ignores presenter-only values", () => {
    expect(
      metadataIdentity({
        ...metadata,
        title: "Renamed",
        durationMinutes: 30,
        slides: {
          1: {
            speakerNotes: "Updated note",
            logicalSlide: 0,
            overlay: 0,
          },
        },
      }),
    ).toBe(metadataIdentity(metadata));
  });

  it("changes when the deck structure changes", () => {
    expect(
      metadataIdentity({
        ...metadata,
        slides: {
          1: { logicalSlide: 0, overlay: 0, hidden: true },
        },
      }),
    ).not.toBe(metadataIdentity(metadata));
  });
});
