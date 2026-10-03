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

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

export const queryPdfpcNotes = (
  typstFile: string,
  root: string,
): PdfpcNote[] => {
  const stdout = execFileSync(
    "typst",
    ["eval", "--root", root, expression, "--in", typstFile, "--format", "json"],
    { encoding: "utf8" },
  );
  const values: unknown = JSON.parse(stdout);
  if (!Array.isArray(values)) throw new Error("expected an array");

  return values.map((value, index) => {
    if (
      !isRecord(value) ||
      !Number.isInteger(value.page) ||
      Number(value.page) < 1 ||
      typeof value["speaker-notes"] !== "string"
    ) {
      throw new Error(`invalid pdfpc note at index ${index}`);
    }
    return {
      page: Number(value.page),
      speakerNotes: value["speaker-notes"],
    };
  });
};
