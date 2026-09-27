import { execFileSync } from "node:child_process";

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

export const queryPdfpcNotes = (
  typstPath: string,
  typstFile: string,
  root: string,
): PdfpcNote[] => {
  const stdout = execFileSync(
    typstPath,
    ["eval", "--root", root, expression, "--in", typstFile, "--format", "json"],
    { encoding: "utf8" },
  );
  const values: unknown = JSON.parse(stdout);
  if (!Array.isArray(values)) throw new Error("expected an array");

  return values.map((value, index) => {
    if (!value || typeof value !== "object")
      throw new Error(`invalid pdfpc note at index ${index}`);
    const note = value as Record<string, unknown>;
    if (
      !Number.isInteger(note.page) ||
      Number(note.page) < 1 ||
      typeof note["speaker-notes"] !== "string"
    ) {
      throw new Error(`invalid pdfpc note at index ${index}`);
    }
    return {
      page: Number(note.page),
      speakerNotes: note["speaker-notes"],
    };
  });
};
