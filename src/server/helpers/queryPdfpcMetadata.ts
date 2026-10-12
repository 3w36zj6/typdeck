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
  startTime?: string;
  endTime?: string;
  lastMinutes?: number;
  disableMarkdown?: boolean;
};

const expression = `query(<pdfpc>)
  .filter(item => type(item.value) == dictionary)
  .filter(item => item.value.at("t", default: none) in (
    "Note", "HiddenSlide", "EndSlide", "SaveSlide", "LogicalSlide", "Overlay",
    "Duration", "StartTime", "EndTime", "LastMinutes", "DisableMarkdown"
  ))
  .map(item => (
    page: item.location().page(),
    speaker-notes: if item.value.t == "Note" { item.value.at("v", default: none) },
    hidden: item.value.t == "HiddenSlide",
    end-slide: item.value.t == "EndSlide",
    saved-slide: item.value.t == "SaveSlide",
    logical-slide: if item.value.t == "LogicalSlide" { item.value.at("v", default: none) },
    overlay: if item.value.t == "Overlay" { item.value.at("v", default: none) },
    duration-minutes: if item.value.t == "Duration" { item.value.at("v", default: none) },
    start-time: if item.value.t == "StartTime" { item.value.at("v", default: none) },
    end-time: if item.value.t == "EndTime" { item.value.at("v", default: none) },
    last-minutes: if item.value.t == "LastMinutes" { item.value.at("v", default: none) },
    disable-markdown: if item.value.t == "DisableMarkdown" { item.value.at("v", default: none) },
  ))`;

const PdfpcMetadataEventSchema = v.array(
  v.object({
    page: v.pipe(v.number(), v.integer(), v.minValue(1)),
    "speaker-notes": v.nullable(v.string()),
    hidden: v.boolean(),
    "end-slide": v.boolean(),
    "saved-slide": v.boolean(),
    "logical-slide": v.nullable(v.pipe(v.number(), v.integer(), v.minValue(0))),
    overlay: v.nullable(v.pipe(v.number(), v.integer(), v.minValue(0))),
    "duration-minutes": v.nullable(v.pipe(v.number(), v.minValue(0))),
    "start-time": v.nullable(
      v.pipe(v.string(), v.regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/)),
    ),
    "end-time": v.nullable(
      v.pipe(v.string(), v.regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/)),
    ),
    "last-minutes": v.nullable(v.pipe(v.number(), v.minValue(0))),
    "disable-markdown": v.nullable(v.boolean()),
  }),
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
  let startTime: string | undefined;
  let endTime: string | undefined;
  let lastMinutes: number | undefined;
  let disableMarkdown: boolean | undefined;
  for (const event of v.parse(PdfpcMetadataEventSchema, JSON.parse(stdout))) {
    if (event["duration-minutes"] !== null) {
      durationMinutes = event["duration-minutes"] || undefined;
      continue;
    }
    if (event["start-time"] !== null) {
      startTime = event["start-time"];
      continue;
    }
    if (event["end-time"] !== null) {
      endTime = event["end-time"];
      continue;
    }
    if (event["last-minutes"] !== null) {
      lastMinutes = event["last-minutes"];
      continue;
    }
    if (event["disable-markdown"] !== null) {
      disableMarkdown = event["disable-markdown"];
      continue;
    }
    const slide = slides.get(event.page) ?? { page: event.page };
    if (event["speaker-notes"] !== null) {
      slide.speakerNotes =
        slide.speakerNotes !== undefined
          ? `${slide.speakerNotes}\n\n${event["speaker-notes"]}`
          : event["speaker-notes"];
    }
    if (event.hidden) slide.hidden = true;
    if (event["end-slide"]) slide.endSlide = true;
    if (event["saved-slide"]) slide.savedSlide = true;
    if (event["logical-slide"] !== null) {
      slide.logicalSlide = event["logical-slide"];
    }
    if (event.overlay !== null) slide.overlay = event.overlay;
    slides.set(event.page, slide);
  }
  return {
    slides: [...slides.values()].map(({ logicalSlide, overlay, ...slide }) =>
      logicalSlide !== undefined && overlay !== undefined
        ? { ...slide, logicalSlide, overlay }
        : slide,
    ),
    ...(durationMinutes === undefined ? {} : { durationMinutes }),
    ...(startTime === undefined ? {} : { startTime }),
    ...(endTime === undefined ? {} : { endTime }),
    ...(lastMinutes === undefined ? {} : { lastMinutes }),
    ...(disableMarkdown === undefined ? {} : { disableMarkdown }),
  };
};
