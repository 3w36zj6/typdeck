import * as v from "valibot";
import { runProcess } from "./runProcess";

type PdfpcSlide = {
  page: number;
  speakerNotes?: string;
  hidden?: true;
  endSlide?: true;
  savedSlide?: true;
  logicalSlide?: number;
  overlay?: number;
};

type PdfpcMetadata = {
  slides: PdfpcSlide[];
  durationMinutes?: number;
  lastMinutes?: number;
};

const expression = `query(<pdfpc>)
  .filter(item => type(item.value) == dictionary)
  .filter(item => item.value.at("t", default: none) in (
    "Note", "HiddenSlide", "EndSlide", "SaveSlide", "LogicalSlide", "Overlay",
    "Duration", "LastMinutes"
  ))
  .map(item => (
    page: item.location().page(),
    type: item.value.t,
    value: item.value.at("v", default: none),
  ))`;

const PageSchema = v.pipe(v.number(), v.integer(), v.minValue(1));
const PdfpcEventSchema = v.array(
  v.variant("type", [
    v.object({
      page: PageSchema,
      type: v.literal("Note"),
      value: v.string(),
    }),
    v.object({
      page: PageSchema,
      type: v.literal("HiddenSlide"),
      value: v.null(),
    }),
    v.object({
      page: PageSchema,
      type: v.literal("EndSlide"),
      value: v.null(),
    }),
    v.object({
      page: PageSchema,
      type: v.literal("SaveSlide"),
      value: v.null(),
    }),
    v.object({
      page: PageSchema,
      type: v.literal("LogicalSlide"),
      value: v.pipe(v.number(), v.integer(), v.minValue(0)),
    }),
    v.object({
      page: PageSchema,
      type: v.literal("Overlay"),
      value: v.pipe(v.number(), v.integer(), v.minValue(0)),
    }),
    v.object({
      page: PageSchema,
      type: v.literal("Duration"),
      value: v.pipe(v.number(), v.minValue(0)),
    }),
    v.object({
      page: PageSchema,
      type: v.literal("LastMinutes"),
      value: v.pipe(v.number(), v.minValue(0)),
    }),
  ]),
);

export const queryPdfpcMetadata = async (
  typstFile: string,
  root: string,
  signal?: AbortSignal,
): Promise<PdfpcMetadata> => {
  const { stdout } = await runProcess(
    "typst",
    ["eval", "--root", root, expression, "--in", typstFile, "--format", "json"],
    signal,
  );

  const slides = new Map<number, PdfpcSlide>();
  let durationMinutes: number | undefined;
  let lastMinutes: number | undefined;
  for (const event of v.parse(PdfpcEventSchema, JSON.parse(stdout))) {
    if (event.type === "Duration") {
      durationMinutes = event.value > 0 ? event.value : undefined;
      continue;
    }
    if (event.type === "LastMinutes") {
      lastMinutes = event.value;
      continue;
    }
    const slide = slides.get(event.page) ?? { page: event.page };
    if (event.type === "Note") {
      slide.speakerNotes =
        slide.speakerNotes === undefined
          ? event.value
          : `${slide.speakerNotes}\n\n${event.value}`;
    } else if (event.type === "HiddenSlide") {
      slide.hidden = true;
    } else if (event.type === "EndSlide") {
      slide.endSlide = true;
    } else if (event.type === "SaveSlide") {
      slide.savedSlide = true;
    } else if (event.type === "LogicalSlide") {
      slide.logicalSlide = event.value;
    } else if (event.type === "Overlay") {
      slide.overlay = event.value;
    }
    slides.set(event.page, slide);
  }
  return {
    slides: [...slides.values()].map(({ logicalSlide, overlay, ...slide }) =>
      logicalSlide !== undefined && overlay !== undefined
        ? { ...slide, logicalSlide, overlay }
        : slide,
    ),
    ...(durationMinutes === undefined ? {} : { durationMinutes }),
    ...(lastMinutes === undefined ? {} : { lastMinutes }),
  };
};
