import { runProcess } from "./runProcess";

export type PdfpcNote = {
  page: number;
  speakerNotes: string;
};

const expression = `query(<pdfpc>)
  .filter(item => type(item.value) == dictionary)
  .filter(item => item.value.at("t", default: none) == "Note")
  .map(item => (
    page: item.location().page(),
    speaker-notes: item.value.at("v", default: none),
  ))`;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

export const queryPdfpcNotes = async (
  typstFile: string,
  root: string,
  signal?: AbortSignal,
): Promise<PdfpcNote[]> => {
  const { stdout } = await runProcess(
    "typst",
    ["eval", "--root", root, expression, "--in", typstFile, "--format", "json"],
    signal,
  );
  const values: unknown = JSON.parse(stdout);
  if (!Array.isArray(values)) throw new Error("expected an array");

  const notes = new Map<number, string[]>();
  for (const [index, value] of values.entries()) {
    if (
      !isRecord(value) ||
      !Number.isInteger(value.page) ||
      Number(value.page) < 1 ||
      typeof value["speaker-notes"] !== "string"
    ) {
      throw new Error(`invalid pdfpc note at index ${index}`);
    }
    const page = Number(value.page);
    const pageNotes = notes.get(page);
    if (pageNotes) pageNotes.push(value["speaker-notes"]);
    else notes.set(page, [value["speaker-notes"]]);
  }

  return Array.from(notes, ([page, pageNotes]) => ({
    page,
    speakerNotes: pageNotes.join("\n\n"),
  }));
};
