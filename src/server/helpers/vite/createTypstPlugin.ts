import { type PluginOption } from "vite";

import { compileTypst } from "./compileTypst";

export const typstPlugin = (typstFile: string): PluginOption => {
  return {
    name: "typst-plugin",
    configureServer(server) {
      server.watcher.add(process.cwd());
    },
    handleHotUpdate({ file, server }) {
      if (file.endsWith(".typ")) {
        compileTypst(typstFile, server.config.publicDir, server);
      }
    },
  };
};
