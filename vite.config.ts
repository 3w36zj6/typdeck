import { defineConfig, ViteDevServer } from "vite";
import solid from "vite-plugin-solid";
import { compileTypst } from "./src/server/helpers/vite/compileTypst";
import fs from "fs";
import path from "path";

export default defineConfig(({ command }) => {
  let devServer: ViteDevServer;

  return {
    base: "./",
    plugins: [
      solid(),
      {
        name: "pre-post-build-process",
        configureServer(server) {
          devServer = server;
        },
        buildStart: () => {
          const distDir = path.resolve(process.cwd(), "dist");
          if (fs.existsSync(distDir)) {
            fs.rmSync(distDir, { recursive: true, force: true });
          }
          const publicDir = path.resolve(process.cwd(), "public");
          const publicAssetsDir = path.join(publicDir, "assets");
          if (fs.existsSync(publicAssetsDir)) {
            fs.rmSync(publicAssetsDir, { recursive: true, force: true });
          }

          compileTypst(
            "demo.typ",
            "public",
            command === "serve" ? devServer : undefined,
          );
        },
        closeBundle: () => {
          const distDir = path.resolve(process.cwd(), "dist");
          const publicDir = path.resolve(process.cwd(), "public");

          try {
            const srcIndex = path.join(distDir, "index.html");
            const destIndex = path.join(publicDir, "index.html");
            if (fs.existsSync(srcIndex)) {
              fs.cpSync(srcIndex, destIndex, { force: true });
            } else {
              console.warn("index.html not found in dist.");
            }

            const srcAssets = path.join(distDir, "assets");
            const destAssets = path.join(publicDir, "assets");
            if (fs.existsSync(srcAssets)) {
              fs.cpSync(srcAssets, destAssets, {
                recursive: true,
                force: true,
              });
            } else {
              console.warn("assets directory not found in dist.");
            }

            const pagesDir = path.join(publicDir, "pages");
            if (fs.existsSync(pagesDir)) {
              fs.rmSync(pagesDir, { recursive: true, force: true });
            } else {
              console.warn("pages directory not found in public.");
            }

            const metadataFile = path.join(publicDir, "metadata.json");
            if (fs.existsSync(metadataFile)) {
              fs.rmSync(metadataFile, { force: true });
            } else {
              console.warn("metadata.json not found in public.");
            }
          } catch (err) {
            console.error("Error during post-build file copy:", err);
          }
        },
      },
    ],
    server: {
      watch: {},
    },
  };
});
