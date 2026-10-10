import fs from "node:fs";
import path from "node:path";
import { build } from "esbuild";

const clientDirectory = path.resolve("public");
const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".svg", "image/svg+xml"],
]);

const clientAssets = Object.fromEntries(
  fs
    .readdirSync(clientDirectory, { encoding: "utf8", recursive: true })
    .filter((file) => fs.statSync(path.join(clientDirectory, file)).isFile())
    .sort()
    .map((file) => {
      const contentType = contentTypes.get(path.extname(file));
      if (!contentType) throw new Error(`Unsupported client asset: ${file}`);
      return [
        `/${file.replaceAll(path.sep, "/")}`,
        {
          body: fs.readFileSync(path.join(clientDirectory, file), "utf8"),
          contentType,
        },
      ];
    }),
);

await build({
  bundle: true,
  define: {
    __TYPDECK_CLIENT_ASSETS__: JSON.stringify(clientAssets),
  },
  entryPoints: ["index.ts"],
  format: "esm",
  minify: true,
  outfile: "bin/index.js",
  packages: "external",
  platform: "node",
});
