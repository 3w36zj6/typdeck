import { ViteDevServer } from "vite";

import fs from "fs";
import path from "path";
import { execFileSync } from "node:child_process";
import { writeMetadataJSON } from "../writeMatadataJSON";
import { queryPdfpcNotes } from "../queryPdfpcNotes";
import { Metadata } from "../../../client/types/metadata";
import chalk from "chalk";

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

export const compileTypst = (
  typstFile: string,
  publicDir: string,
  server?: ViteDevServer,
) => {
  const pagesOutDirPath = path.resolve(publicDir, "pages");
  if (!fs.existsSync(pagesOutDirPath)) {
    fs.mkdirSync(pagesOutDirPath, { recursive: true });
  }

  fs.readdirSync(pagesOutDirPath).forEach((file) => {
    fs.unlinkSync(path.resolve(pagesOutDirPath, file));
  });

  try {
    const args = [
      "compile",
      typstFile,
      path.resolve(pagesOutDirPath, "{p}.svg"),
      "-f",
      "svg",
    ];
    logWithTimestamp(
      chalk.dim(
        `${chalk.magenta("$")} typst ${args.map((arg) => JSON.stringify(arg)).join(" ")}`,
      ),
    );
    const stdout = execFileSync("typst", args, { encoding: "utf8" });
    console.info(chalk.dim(stdout.trim()));
  } catch (err) {
    console.error(err);
    return;
  }

  const pageCount = fs
    .readdirSync(pagesOutDirPath)
    .map((file) => {
      const match = file.match(/(\d+)\.svg$/);
      return match ? parseInt(match[1]) : 0;
    })
    .reduce((a, b) => Math.max(a, b), 0);

  const metadata: Metadata = {
    pageCount,
  };

  const slidesSettings: NonNullable<Metadata["slides"]> = {};
  for (const note of queryPdfpcNotes(typstFile, process.cwd())) {
    if (note.page > pageCount) continue;
    slidesSettings[`${note.page}`] = { speakerNotes: note.speakerNotes };
  }
  if (Object.keys(slidesSettings).length > 0) {
    metadata.slides = slidesSettings;
  }

  writeMetadataJSON(metadata, path.resolve(publicDir, "metadata.json"));

  server?.ws.send({
    type: "full-reload",
    path: "*",
  });
};
