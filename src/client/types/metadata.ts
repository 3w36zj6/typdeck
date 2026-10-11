import * as v from "valibot";

const PageKeySchema = v.custom<`${number}`>(
  (page) => typeof page === "string" && /^[1-9]\d*$/.test(page),
);

const LanguageSchema = v.pipe(
  v.string(),
  v.trim(),
  v.minLength(1),
  v.check((language) => {
    try {
      return Intl.getCanonicalLocales(language).length === 1;
    } catch {
      return false;
    }
  }, "Language must be a valid BCP 47 tag"),
);

const MetadataSchema = v.pipe(
  v.object({
    pageCount: v.pipe(v.number(), v.integer(), v.minValue(1)),
    pageLabels: v.optional(v.array(v.string())),
    title: v.optional(v.pipe(v.string(), v.trim(), v.minLength(1))),
    language: v.optional(LanguageSchema),
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
        v.object({
          speakerNotes: v.optional(v.string()),
          hidden: v.optional(v.literal(true)),
        }),
      ),
    ),
  }),
  v.check(
    ({ pageCount, pageLabels }) =>
      pageLabels === undefined || pageLabels.length === pageCount,
    "Page labels must match the page count",
  ),
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
