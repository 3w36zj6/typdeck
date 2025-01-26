import { InlineConfig } from "vite";
import path from "path";
import { typstPlugin } from "./createTypstPlugin";
import { copyPublicFilesPlugin } from "./createCopyPublicFilesPlugin";
import { injectIndexHtmlPlugin } from "./createInjectIndexHtmlPlugin";

type CommandType = "dev" | "build" | "preview";

export const createConfig = (
  outDir: string,
  typstFile?: string,
  command?: CommandType,
): InlineConfig => ({
  configFile: false,
  root:
    command !== "build"
      ? process.cwd()
      : path.join(process.cwd(), ".typdeck/public"),
  publicDir: path.join(process.cwd(), ".typdeck/public"),
  plugins: [
    copyPublicFilesPlugin(),
    injectIndexHtmlPlugin(),
    ...(typstFile ? [typstPlugin(typstFile)] : []),
  ],
  build: {
    outDir: path.resolve(process.cwd(), outDir),
    emptyOutDir: true,
  },
});
