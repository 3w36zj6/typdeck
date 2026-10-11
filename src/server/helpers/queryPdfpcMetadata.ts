import * as v from "valibot";
import { runProcess } from "./runProcess";

type PdfpcSlide = {
  page: number;
  speakerNotes?: string;
  hidden?: true;
};

const expression = `query(<pdfpc>)
  .filter(item => type(item.value) == dictionary)
  .filter(item => item.value.at("t", default: none) in ("Note", "HiddenSlide"))
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
  ]),
);

export const queryPdfpcMetadata = async (
  typstFile: string,
  root: string,
  signal?: AbortSignal,
): Promise<PdfpcSlide[]> => {
  const { stdout } = await runProcess(
    "typst",
    ["eval", "--root", root, expression, "--in", typstFile, "--format", "json"],
    signal,
  );

  const slides = new Map<number, PdfpcSlide>();
  for (const event of v.parse(PdfpcEventSchema, JSON.parse(stdout))) {
    const slide = slides.get(event.page) ?? { page: event.page };
    if (event.type === "Note") {
      slide.speakerNotes =
        slide.speakerNotes === undefined
          ? event.value
          : `${slide.speakerNotes}\n\n${event.value}`;
    } else {
      slide.hidden = true;
    }
    slides.set(event.page, slide);
  }
  return [...slides.values()];
};
