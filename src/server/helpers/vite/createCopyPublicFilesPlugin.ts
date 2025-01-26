import path from "path";
import fs from "fs";
import { type PluginOption, type ResolvedConfig } from "vite";
import { getPackageRootPath } from "../getPackageRootPath";

export const copyPublicFilesPlugin = (): PluginOption => {
  let config: ResolvedConfig;

  return {
    name: "copy-public-files-plugin",
    configResolved: (resolvedConfig) => {
      config = resolvedConfig;
    },
    buildStart: () => {
      const packageRoot = getPackageRootPath();
      const sourcePublicDir = path.join(packageRoot, "public");
      const destPublicDir = path.resolve(process.cwd(), config.publicDir);
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
      } catch (err) {
        console.error("Failed to copy public files:", err);
      }
    },
  };
};
