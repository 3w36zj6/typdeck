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
  const resolvedPublicDir = path.resolve(publicDir);
  fs.mkdirSync(resolvedPublicDir, { recursive: true });
  const stagingDir = fs.mkdtempSync(path.join(resolvedPublicDir, ".compile-"));

  try {
    const pagesOutDirPath = path.join(stagingDir, "pages");
    fs.mkdirSync(pagesOutDirPath);

    const args = [
      "compile",
      typstFile,
      path.join(pagesOutDirPath, "{p}.svg"),
      "-f",
      "svg",
    ];
    logWithTimestamp(
      chalk.dim(
        `${chalk.magenta("$")} typst ${args.map((arg) => JSON.stringify(arg)).join(" ")}`,
      ),
    );
    const stdout = execFileSync("typst", args, {
      encoding: "utf8",
      stdio: "pipe",
    });
    console.info(chalk.dim(stdout.trim()));

    const pageCount = fs
      .readdirSync(pagesOutDirPath)
      .map((file) => {
        const match = file.match(/(\d+)\.svg$/);
        return match ? parseInt(match[1]) : 0;
      })
      .reduce((a, b) => Math.max(a, b), 0);

    const metadata: Metadata = { pageCount };
    const slidesSettings: NonNullable<Metadata["slides"]> = {};
    for (const note of queryPdfpcNotes(typstFile, process.cwd())) {
      if (note.page > pageCount) continue;
      slidesSettings[`${note.page}`] = { speakerNotes: note.speakerNotes };
    }
    if (Object.keys(slidesSettings).length > 0) {
      metadata.slides = slidesSettings;
    }
    writeMetadataJSON(metadata, path.join(stagingDir, "metadata.json"));

    const installed: string[] = [];
    const backups: { backup: string; target: string }[] = [];
    try {
      for (const name of ["pages", "metadata.json"]) {
        const source = path.join(stagingDir, name);
        const target = path.join(resolvedPublicDir, name);
        const backup = path.join(stagingDir, `.previous-${name}`);
        if (fs.existsSync(target)) {
          fs.renameSync(target, backup);
          backups.push({ backup, target });
        }
        fs.renameSync(source, target);
        installed.push(target);
      }
    } catch (error) {
      for (const target of installed.reverse()) {
        fs.rmSync(target, { recursive: true, force: true });
      }
      for (const { backup, target } of backups.reverse()) {
        fs.renameSync(backup, target);
      }
      throw error;
    }

    server?.ws.send({ type: "full-reload", path: "*" });
  } catch (error) {
    console.error(error);
    throw error;
  } finally {
    fs.rmSync(stagingDir, { recursive: true, force: true });
  }
};
