import fs from "node:fs";
import { findPackageJSON } from "node:module";
import path from "node:path";
import { type InlineConfig } from "vite";
import { compileTypst } from "./compileTypst";
import { typstPlugin } from "./createTypstPlugin";

const setupDotDirectory = (typstFile?: string) => {
  const dotDirectory = path.resolve(process.cwd(), ".typdeck");
  const publicDirectory = path.join(dotDirectory, "public");

  fs.mkdirSync(dotDirectory, { recursive: true });
  fs.writeFileSync(path.join(dotDirectory, ".gitignore"), "*\n", "utf8");
  if (typstFile) compileTypst(typstFile, publicDirectory);
};

type CommandType = "dev" | "build" | "preview";

export const createViteConfig = (
  outDir: string,
  typstFile?: string,
  command?: CommandType,
): InlineConfig => {
  const packageJson = findPackageJSON(import.meta.url);
  if (!packageJson) throw new Error("Could not find typdeck package.json");
  setupDotDirectory(typstFile);

  return {
    configFile: false,
    base: "./",
    root:
      command === "preview"
        ? process.cwd()
        : path.join(path.dirname(packageJson), "public"),
    publicDir:
      command === "preview"
        ? false
        : path.resolve(process.cwd(), ".typdeck/public"),
    plugins: typstFile ? [typstPlugin(typstFile)] : [],
    build: {
      outDir: path.resolve(process.cwd(), outDir),
      emptyOutDir: true,
    },
    logLevel: command === "build" ? "info" : "silent",
  };
};
