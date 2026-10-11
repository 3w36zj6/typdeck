import * as v from "valibot";

const PageKeySchema = v.custom<`${number}`>(
  (page) => typeof page === "string" && /^[1-9]\d*$/.test(page),
);

const MetadataSchema = v.pipe(
  v.object({
    pageCount: v.pipe(v.number(), v.integer(), v.minValue(1)),
    outline: v.array(
      v.object({
        text: v.string(),
        label: v.optional(v.string()),
        level: v.pipe(v.number(), v.integer(), v.minValue(1)),
        page: v.pipe(v.number(), v.integer(), v.minValue(1)),
      }),
    ),
    slides: v.optional(
      v.record(
        PageKeySchema,
        v.object({ speakerNotes: v.optional(v.string()) }),
      ),
    ),
  }),
  v.check(
    ({ pageCount, outline, slides }) =>
      outline.every(({ page }) => page <= pageCount) &&
      (!slides ||
        Object.keys(slides).every((page) => Number(page) <= pageCount)),
    "Metadata refers to a page outside the deck",
  ),
);

export type Metadata = v.InferOutput<typeof MetadataSchema>;

export const parseMetadata = (value: unknown): Metadata =>
  v.parse(MetadataSchema, value);
