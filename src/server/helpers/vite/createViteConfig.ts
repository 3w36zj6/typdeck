import { InlineConfig } from "vite";
import path from "path";
import fs from "fs";
import { typstPlugin } from "./createTypstPlugin";
import { injectIndexHtmlPlugin } from "./createInjectIndexHtmlPlugin";
import { getPackageRootPath } from "../getPackageRootPath";
import { compileTypst } from "./compileTypst";

const setupDotDirectory = (typstFile?: string) => {
  const packageRoot = getPackageRootPath();
  const sourcePublicDir = path.join(packageRoot, "public");
  const destPublicDir = path.resolve(process.cwd(), ".typdeck/public");
  const destDotFolderDir = path.resolve(process.cwd(), ".typdeck");

  try {
    if (fs.existsSync(sourcePublicDir)) {
      fs.cpSync(sourcePublicDir, destPublicDir, {
        recursive: true,
        force: true,
      });
    } else {
      console.warn(
        `Source public directory ${sourcePublicDir} does not exist.`,
      );
    }
    const gitignoreContent = `*
`;

    const destGitignorePath = path.join(destDotFolderDir, ".gitignore");
    fs.writeFileSync(destGitignorePath, gitignoreContent, "utf-8");

    if (typstFile) {
      compileTypst(typstFile, ".typdeck/public");
    }
  } catch (err) {
    console.error("Failed to copy public files:", err);
  }
};

type CommandType = "dev" | "build" | "preview";

export const createViteConfig = (
  outDir: string,
  typstFile?: string,
  command?: CommandType,
): InlineConfig => {
  setupDotDirectory(typstFile);
  return {
    configFile: false,
    base: "./",
    root:
      command !== "build"
        ? process.cwd()
        : path.join(process.cwd(), ".typdeck/public"),
    publicDir: path.join(process.cwd(), ".typdeck/public"),
    plugins: [
      injectIndexHtmlPlugin(),
      ...(typstFile ? [typstPlugin(typstFile)] : []),
    ],
    build: {
      outDir: path.resolve(process.cwd(), outDir),
      emptyOutDir: true,
    },
    logLevel: command === "build" ? "info" : "silent",
  };
};
