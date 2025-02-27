import { type PluginOption, type ResolvedConfig } from "vite";

import { compileTypst } from "./compileTypst";

export const typstPlugin = (typstFile: string): PluginOption => {
  let config: ResolvedConfig;

  return {
    name: "typst-plugin",
    configResolved(resolvedConfig) {
      config = resolvedConfig;
    },
    handleHotUpdate({ file, server }) {
      if (file.endsWith(".typ")) {
        compileTypst(typstFile, config.publicDir, server);
      }
    },
  };
};
