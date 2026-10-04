import fs from "node:fs";
import path from "node:path";
import { type ViteDevServer } from "vite";
import chalk from "chalk";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { type Metadata } from "../../../client/types/metadata";
import { queryPdfpcNotes } from "../queryPdfpcNotes";
import { queryTypstHeadings } from "../queryTypstHeadings";
import { runProcess } from "../runProcess";
import { writeMetadataJSON } from "../writeMatadataJSON";

const getTimeStamp = (): string => {
  const now = new Date();
  const hours = now.getHours().toString().padStart(2, "0");
  const minutes = now.getMinutes().toString().padStart(2, "0");
  const seconds = now.getSeconds().toString().padStart(2, "0");
  return `${hours}:${minutes}:${seconds}`;
};

const logWithTimestamp = (message: string, logFn = console.info): void => {
  const timestamp = getTimeStamp();
  logFn(`${chalk.gray(`[${timestamp}]`)} ${message}`);
};

const replaceGeneratedOutput = (stagingDir: string, publicDir: string) => {
  const backupDir = `${stagingDir}-previous`;
  const hasPreviousOutput = fs.existsSync(publicDir);

  if (hasPreviousOutput) fs.renameSync(publicDir, backupDir);
  try {
    fs.renameSync(stagingDir, publicDir);
  } catch (error) {
    if (hasPreviousOutput) fs.renameSync(backupDir, publicDir);
    throw error;
  }
  fs.rmSync(backupDir, { recursive: true, force: true });
};

export const compileTypst = async (
  typstFile: string,
  publicDir: string,
  server?: ViteDevServer,
  signal?: AbortSignal,
): Promise<void> => {
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

  const metadata: Metadata = {
    pageCount,
    outline: await queryTypstHeadings(typstFile, process.cwd(), signal),
  };
  const slidesSettings: NonNullable<Metadata["slides"]> = {};

  for (const note of await queryPdfpcNotes(typstFile, process.cwd(), signal)) {
    if (note.page > pageCount) continue;
    slidesSettings[`${note.page}`] = { speakerNotes: note.speakerNotes };
  }

  if (Object.keys(slidesSettings).length > 0) {
    metadata.slides = slidesSettings;
  }

  writeMetadataJSON(metadata, path.join(stagingDir, "metadata.json"));
  replaceGeneratedOutput(stagingDir, resolvedPublicDir);

  server?.ws.send({ type: "full-reload", path: "*" });
};
