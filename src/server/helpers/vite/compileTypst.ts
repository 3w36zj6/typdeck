import { ViteDevServer } from "vite";

import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { writeMetadataJSON } from "../writeMatadataJSON";
import { getTypstPath } from "../getTypstPath";
import type { ConfigFile } from "../../types/ConfigFile";
import { readConfigFile } from "../readConfigFile";
import { Metadata } from "../../../client/types/metadata";

let cachedTypstPath: string | null = null;
let cachedConfig: ConfigFile | null = null;

export const compileTypst = (
  typstFile: string,
  publicDir: string,
  server?: ViteDevServer,
) => {
  if (cachedTypstPath === null) {
    cachedTypstPath = getTypstPath();
    if (cachedTypstPath) {
      console.info(`typst is found at: ${cachedTypstPath}`);
    } else {
      console.error("typst command not found in PATH.");
      return;
    }
  }
  if (cachedConfig === null) {
    cachedConfig = readConfigFile(process.cwd());
  }

  const pagesOutDirPath = path.resolve(publicDir, "pages");
  if (!fs.existsSync(pagesOutDirPath)) {
    fs.mkdirSync(pagesOutDirPath, { recursive: true });
  }

  fs.readdirSync(pagesOutDirPath).forEach((file) => {
    fs.unlinkSync(path.resolve(pagesOutDirPath, file));
  });

  try {
    const stdout = execSync(
      `typst compile ${typstFile} ${path.resolve(pagesOutDirPath, "{p}.svg")} -f svg`,
    );
    console.info(stdout.toString());
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

  if (cachedConfig?.slides && Object.keys(cachedConfig.slides).length > 0) {
    const slidesSettings: NonNullable<Metadata["slides"]> = {};
    Object.entries(cachedConfig.slides).forEach(([key, settings]) => {
      if (!/^[1-9]\d*$/.test(key)) {
        return;
      }
      const slideNumber = Number(key);
      if (slideNumber <= 0 || slideNumber > pageCount) {
        return;
      }
      slidesSettings[key as keyof ConfigFile["slides"]] = {
        speakerNotes: settings.speakerNotes,
      };
    });
    metadata.slides = slidesSettings;
  }

  writeMetadataJSON(metadata, path.resolve(publicDir, "metadata.json"));

  server?.ws.send({
    type: "full-reload",
    path: "*",
  });
};
