import * as v from "valibot";
import { runProcess } from "./runProcess.ts";

type TypstHeading = {
  text: string;
  label?: string;
  level: number;
  page: number;
};

const expression = `query(heading).filter(h => h.outlined).map(h => (
    body: h.body,
    label: if h.has("label") { str(h.label) } else { none },
    level: h.level,
    page: h.location().page(),
  ))`;

const HeadingsSchema = v.array(
  v.object({
    body: v.unknown(),
    label: v.nullable(v.string()),
    level: v.pipe(v.number(), v.integer(), v.minValue(1)),
    page: v.pipe(v.number(), v.integer(), v.minValue(1)),
  }),
);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const contentText = (value: unknown): string => {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(contentText).join("");
  if (!isRecord(value)) return "";

  if (value.func === "space" || value.func === "linebreak") return " ";
  if (typeof value.text === "string") return value.text;
  if (value.func === "smartquote") return value.double === false ? "'" : '"';
  if ("body" in value) return contentText(value.body);
  if ("children" in value) return contentText(value.children);
  return "";
};

export const queryTypstHeadings = (
  typstFile: string,
  root: string,
  signal?: AbortSignal,
): Promise<TypstHeading[]> =>
  runProcess(
    "typst",
    ["eval", "--root", root, expression, "--in", typstFile, "--format", "json"],
    signal,
  ).then(({ stdout }) => {
    return v.parse(HeadingsSchema, JSON.parse(stdout)).map((value) => {
      const text = contentText(value.body).replace(/\s+/g, " ").trim();
      return {
        text,
        label: value.label ?? undefined,
        level: value.level,
        page: value.page,
      };
    });
  });
