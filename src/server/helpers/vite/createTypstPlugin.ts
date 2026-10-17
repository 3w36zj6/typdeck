import { type PluginOption } from "vite";

import { reportError } from "../../cliOutput";
import { compileTypst } from "../compileTypst";

export const typstPlugin = (typstFile: string): PluginOption => {
  let activeCompile: AbortController | undefined;

  return {
    name: "typst-plugin",
    configureServer(server) {
      server.watcher.add(process.cwd());
    },
    async handleHotUpdate({ file, server }) {
      if (file.endsWith(".typ")) {
        activeCompile?.abort();
        const controller = new AbortController();
        activeCompile = controller;
        try {
          await compileTypst(
            typstFile,
            server.config.publicDir,
            controller.signal,
          );
          server.ws.send({ type: "full-reload", path: "*" });
        } catch (error) {
          if (!controller.signal.aborted) {
            reportError(error);
            throw error;
          }
        } finally {
          if (activeCompile === controller) activeCompile = undefined;
        }
      }
    },
  };
};
