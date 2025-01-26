import { ViteDevServer } from "vite";

import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { writeMetadataJSON } from "../writeMatadataJSON";

export const compileTypst = (
  typstFile: string,
  publicDir: string,
  server?: ViteDevServer,
) => {
  try {
    const typstPath = execSync("which typst").toString().trim();
    console.info(`typst is found at: ${typstPath}`);
  } catch {
    console.error("typst command not found in PATH.");
    return;
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

  writeMetadataJSON({ pageCount }, path.resolve(publicDir, "metadata.json"));

  server?.ws.send({
    type: "full-reload",
    path: "*",
  });
};
