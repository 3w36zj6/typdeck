import { defineConfig } from "vite";
import solid from "vite-plugin-solid";
import path from "node:path";
import { compileTypst } from "./src/server/helpers/vite/compileTypst";
import { typstPlugin } from "./src/server/helpers/vite/createTypstPlugin";

export default defineConfig(async ({ command, isPreview }) => {
  const isDev = command === "serve" && !isPreview;
  const devDeckDir = path.resolve(".typdeck/dev-deck");
  const publicDir: string | false = isDev ? devDeckDir : false;
  if (isDev) await compileTypst("demo.typ", devDeckDir);

  return {
    base: "./",
    publicDir,
    plugins: isDev ? [solid(), typstPlugin("demo.typ")] : [solid()],
    build: {
      outDir: "public",
      emptyOutDir: true,
    },
  };
});
