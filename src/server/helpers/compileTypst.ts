import fs from "node:fs";
import path from "node:path";
import chalk from "chalk";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import * as v from "valibot";
import { type Metadata } from "../../client/types/metadata";
import { queryPdfpcNotes } from "./queryPdfpcNotes";
import { queryTypstHeadings } from "./queryTypstHeadings";
import { runProcess } from "./runProcess";

const CompilationInputsSchema = v.object({
  inputs: v.array(v.string()),
});

const timestampFormat = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  hourCycle: "h23",
  minute: "2-digit",
  second: "2-digit",
});

const logWithTimestamp = (message: string, logFn = console.info): void => {
  logFn(`${chalk.gray(`[${timestampFormat.format()}]`)} ${message}`);
};

export const assertSupportedTypstVersion = (output: string): void => {
  const match = /^typst (\d+)\.(\d+)\.(\d+)(?:\s|$)/.exec(output.trim());
  if (!match || (Number(match[1]) === 0 && Number(match[2]) < 15)) {
    throw new Error("typdeck requires Typst 0.15.0 or newer");
  }
};

let typstVersionCheck: Promise<void> | undefined;

const ensureSupportedTypstVersion = (): Promise<void> =>
  (typstVersionCheck ??= runProcess("typst", ["--version"]).then(({ stdout }) =>
    assertSupportedTypstVersion(stdout),
  ));

export const replaceDirectory = (source: string, destination: string) => {
  const backup = `${source}-previous`;
  const hasPrevious = fs.existsSync(destination);

  if (hasPrevious) fs.renameSync(destination, backup);
  try {
    fs.renameSync(source, destination);
  } catch (error) {
    if (hasPrevious) fs.renameSync(backup, destination);
    throw error;
  }
  fs.rmSync(backup, { recursive: true, force: true });
};

export const compileTypst = async (
  typstFile: string,
  publicDir: string,
  signal?: AbortSignal,
): Promise<string[]> => {
  await ensureSupportedTypstVersion();
  const resolvedPublicDir = path.resolve(publicDir);
  fs.mkdirSync(path.dirname(resolvedPublicDir), { recursive: true });
  using staging = fs.mkdtempDisposableSync(
    path.join(
      path.dirname(resolvedPublicDir),
      `.${path.basename(resolvedPublicDir)}-compile-`,
    ),
  );
  const stagingDir = staging.path;

  const pdfPath = path.join(stagingDir, "deck.pdf");
  const compilationInputsPath = path.join(
    stagingDir,
    "compilation-inputs.json",
  );
  const args = [
    "compile",
    "--root",
    process.cwd(),
    typstFile,
    pdfPath,
    "--format",
    "pdf",
    "--deps",
    compilationInputsPath,
    "--deps-format",
    "json",
  ];
  logWithTimestamp(
    chalk.dim(
      `${chalk.magenta("$")} typst ${args.map((arg) => JSON.stringify(arg)).join(" ")}`,
    ),
  );
  const { stdout, stderr } = await runProcess("typst", args, signal);
  if (stderr.trim()) console.warn(stderr.trim());
  console.info(chalk.dim(stdout.trim()));
  const compilationInputs = v
    .parse(
      CompilationInputsSchema,
      JSON.parse(fs.readFileSync(compilationInputsPath, "utf8")),
    )
    .inputs.map((input) => path.resolve(input));
  fs.unlinkSync(compilationInputsPath);

  const pdfTask = getDocument({
    data: new Uint8Array(fs.readFileSync(pdfPath)),
  });
  const pdfMetadata = pdfTask.promise.then(async (document) => {
    const [labels, { info }] = await Promise.all([
      document.getPageLabels(),
      document.getMetadata(),
    ]);
    const title =
      "Title" in info && typeof info.Title === "string"
        ? info.Title.trim() || undefined
        : undefined;
    const language =
      "Language" in info && typeof info.Language === "string"
        ? info.Language.trim() || undefined
        : undefined;
    return {
      pageCount: document.numPages,
      pageLabels: labels ?? undefined,
      title,
      language,
    };
  });

  const [{ pageCount, pageLabels, title, language }, outline, notes] =
    await Promise.all([
      pdfMetadata.finally(() => pdfTask.destroy()),
      queryTypstHeadings(typstFile, process.cwd(), signal),
      queryPdfpcNotes(typstFile, process.cwd(), signal),
    ]);
  const slides: NonNullable<Metadata["slides"]> = Object.fromEntries(
    notes
      .filter(({ page }) => page <= pageCount)
      .map(({ page, speakerNotes }) => [`${page}`, { speakerNotes }]),
  );
  const metadata: Metadata = {
    pageCount,
    ...(pageLabels === undefined ? {} : { pageLabels }),
    ...(title === undefined ? {} : { title }),
    ...(language === undefined ? {} : { language }),
    outline,
    ...(Object.keys(slides).length > 0 ? { slides } : {}),
  };

  fs.writeFileSync(
    path.join(stagingDir, "metadata.json"),
    JSON.stringify(metadata),
  );
  replaceDirectory(stagingDir, resolvedPublicDir);
  return compilationInputs;
};
