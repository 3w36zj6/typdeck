import path from "path";
import fs from "fs";
import { type PluginOption } from "vite";
import { getPackageRootPath } from "../getPackageRootPath";
import { parse as parseUrl } from "url";
export const injectIndexHtmlPlugin = (): PluginOption => {
  return {
    name: "inject-index-html-plugin",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const parsedUrl = parseUrl(req.url || "", true);
        const pathname = parsedUrl.pathname || "";

        if (pathname === "/" || pathname === "/index.html") {
          const staticIndexPath = path.resolve(
            getPackageRootPath(),
            "public/index.html",
          );
          fs.readFile(staticIndexPath, "utf-8", (err, data) => {
            if (err) {
              res.writeHead(500, { "Content-Type": "text/plain" });
              res.end("Error loading index.html");
              console.error("Error reading index.html:", err);
            } else {
              // Inject the Vite HMR client script.
              const hmrClientScript = `<script type="module" src="/@vite/client"></script>`;
              const htmlWithHmr = data.replace(
                /<\/body>/i,
                `${hmrClientScript}</body>`,
              );
              res.writeHead(200, { "Content-Type": "text/html" });
              res.end(htmlWithHmr);
            }
          });
          return;
        }
        next();
      });
    },
  };
};
