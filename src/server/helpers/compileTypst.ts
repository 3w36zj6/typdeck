import fs from "node:fs";
import path from "node:path";
import chalk from "chalk";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { type Metadata } from "../../client/types/metadata";
import { queryPdfpcNotes } from "./queryPdfpcNotes";
import { queryTypstHeadings } from "./queryTypstHeadings";
import { runProcess } from "./runProcess";
import { writeMetadataJSON } from "./writeMatadataJSON";

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
): Promise<void> => {
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
  const args = [
    "compile",
    "--root",
    process.cwd(),
    typstFile,
    pdfPath,
    "--format",
    "pdf",
  ];
  logWithTimestamp(
    chalk.dim(
      `${chalk.magenta("$")} typst ${args.map((arg) => JSON.stringify(arg)).join(" ")}`,
    ),
  );
  const { stdout, stderr } = await runProcess("typst", args, signal);
  if (stderr.trim()) console.warn(stderr.trim());
  console.info(chalk.dim(stdout.trim()));

  const pdfTask = getDocument({
    data: new Uint8Array(fs.readFileSync(pdfPath)),
  });
  let pageCount: number;
  try {
    pageCount = (await pdfTask.promise).numPages;
  } finally {
    await pdfTask.destroy();
  }

  const outline = await queryTypstHeadings(typstFile, process.cwd(), signal);
  const notes = await queryPdfpcNotes(typstFile, process.cwd(), signal);
  const slides: NonNullable<Metadata["slides"]> = Object.fromEntries(
    notes
      .filter(({ page }) => page <= pageCount)
      .map(({ page, speakerNotes }) => [`${page}`, { speakerNotes }]),
  );
  const metadata: Metadata = {
    pageCount,
    outline,
    ...(Object.keys(slides).length > 0 ? { slides } : {}),
  };

  writeMetadataJSON(metadata, path.join(stagingDir, "metadata.json"));
  replaceDirectory(stagingDir, resolvedPublicDir);
};
