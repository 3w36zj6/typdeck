import * as v from "valibot";

const PageKeySchema = v.custom<`${number}`>(
  (page) => typeof page === "string" && /^[1-9]\d*$/.test(page),
);

const TimeSchema = v.pipe(v.string(), v.regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/));

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

const SlideSchema = v.pipe(
  v.object({
    speakerNotes: v.optional(v.string()),
    hidden: v.optional(v.literal(true)),
    endSlide: v.optional(v.literal(true)),
    savedSlide: v.optional(v.literal(true)),
    logicalSlide: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0))),
    overlay: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0))),
  }),
  v.check(
    ({ logicalSlide, overlay }) =>
      (logicalSlide === undefined) === (overlay === undefined),
    "Overlay and logical slide must be provided together",
  ),
);

const MetadataSchema = v.pipe(
  v.object({
    pageCount: v.pipe(v.number(), v.integer(), v.minValue(1)),
    pageLabels: v.optional(v.array(v.string())),
    title: v.optional(v.pipe(v.string(), v.trim(), v.minLength(1))),
    language: v.optional(LanguageSchema),
    durationMinutes: v.optional(v.pipe(v.number(), v.gtValue(0))),
    startTime: v.optional(TimeSchema),
    endTime: v.optional(TimeSchema),
    lastMinutes: v.optional(v.pipe(v.number(), v.minValue(0))),
    disableMarkdown: v.optional(v.boolean()),
    outline: v.array(
      v.object({
        text: v.string(),
        label: v.optional(v.string()),
        level: v.pipe(v.number(), v.integer(), v.minValue(1)),
        page: v.pipe(v.number(), v.integer(), v.minValue(1)),
      }),
    ),
    slides: v.optional(v.record(PageKeySchema, SlideSchema)),
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

export const metadataIdentity = ({ pageCount, outline, slides }: Metadata) =>
  JSON.stringify({
    pageCount,
    outline,
    slides: Object.fromEntries(
      Object.entries(slides ?? {})
        .filter(
          ([, slide]) =>
            slide?.hidden ||
            slide?.logicalSlide !== undefined ||
            slide?.overlay !== undefined,
        )
        .map(([page, slide]) => [
          page,
          {
            hidden: slide?.hidden,
            logicalSlide: slide?.logicalSlide,
            overlay: slide?.overlay,
          },
        ]),
    ),
  });

export const parseMetadata = (value: unknown): Metadata =>
  v.parse(MetadataSchema, value);
