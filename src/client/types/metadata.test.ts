import { describe, expect, expectTypeOf, it } from "vitest";
import { parseMetadata, type Metadata } from "./metadata";

describe("parseMetadata", () => {
  expectTypeOf<
    keyof NonNullable<Metadata["slides"]>
  >().toEqualTypeOf<`${number}`>();

  it("parses the current manifest", () => {
    expect(
      parseMetadata({
        pageCount: 2,
        pageLabels: ["i", "ii"],
        outline: [{ text: "Introduction", label: "intro", level: 1, page: 1 }],
        slides: { 2: { speakerNotes: "Remember this" } },
      }),
    ).toEqual({
      pageCount: 2,
      pageLabels: ["i", "ii"],
      outline: [{ text: "Introduction", label: "intro", level: 1, page: 1 }],
      slides: { 2: { speakerNotes: "Remember this" } },
    });
  });

  it("rejects an invalid manifest", () => {
    expect(() => parseMetadata({ pageCount: 1 })).toThrow();
    expect(() => parseMetadata({ pageCount: 0, outline: [] })).toThrow();
    expect(() =>
      parseMetadata({ pageCount: 2, pageLabels: ["1"], outline: [] }),
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
  });
});
