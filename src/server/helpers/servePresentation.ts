import fs from "node:fs";
import http, { type ServerResponse } from "node:http";
import path from "node:path";
import { pipeline } from "node:stream";
import send from "@fastify/send";
import { watch } from "chokidar";
import { compileTypst } from "./compileTypst";

const reloadPath = "/__typdeck_reload";
const reloadScript = `<script>new EventSource("${reloadPath}").onmessage=()=>location.reload()</script>`;
const ignoredDirectories = new Set([".git", ".typdeck", "node_modules"]);

const sendStatus = (
  response: ServerResponse,
  status: number,
  headers?: http.OutgoingHttpHeaders,
) => response.writeHead(status, headers).end();

const sendIndex = (
  request: http.IncomingMessage,
  response: ServerResponse,
  body: Buffer,
) => {
  response.writeHead(200, {
    "Cache-Control": "no-store",
    "Content-Length": body.byteLength,
    "Content-Type": "text/html; charset=utf-8",
  });
  response.end(request.method === "HEAD" ? undefined : body);
};

export const servePresentation = async (
  typstFile: string,
  clientDirectory: string,
  deckDirectory: string,
) => {
  const reloadClients = new Set<ServerResponse>();
  const index = Buffer.from(
    fs
      .readFileSync(path.join(clientDirectory, "index.html"), "utf8")
      .replace("</head>", `${reloadScript}</head>`),
  );
  const deckAssets = new Map([
    ["/deck.pdf", "/deck.pdf"],
    ["/metadata.json", "/metadata.json"],
  ]);

  const handleRequest = async (
    request: http.IncomingMessage,
    response: ServerResponse,
  ) => {
    if (request.method !== "GET" && request.method !== "HEAD") {
      sendStatus(response, 405, { Allow: "GET, HEAD" });
      return;
    }

    let pathname: string;
    try {
      pathname = new URL(request.url ?? "/", "http://localhost").pathname;
    } catch {
      sendStatus(response, 400);
      return;
    }

    if (pathname === reloadPath && request.method === "GET") {
      response.writeHead(200, {
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "Content-Type": "text/event-stream",
      });
      reloadClients.add(response);
      request.on("close", () => reloadClients.delete(response));
      return;
    }

    if (pathname === "/" || pathname === "/index.html") {
      sendIndex(request, response, index);
      return;
    }

    const deckAsset = deckAssets.get(pathname);
    const result = await send(request, deckAsset ?? pathname, {
      root: deckAsset ? deckDirectory : clientDirectory,
      index: false,
    });
    result.headers["Cache-Control"] = "no-store";
    response.writeHead(result.statusCode, result.headers);
    if (request.method === "HEAD") {
      result.stream.destroy();
      response.end();
      return;
    }
    pipeline(result.stream, response, (error) => {
      if (error) response.destroy(error);
    });
  };

  const server = http.createServer((request, response) => {
    void handleRequest(request, response).catch((error: unknown) => {
      console.error(error);
      if (response.headersSent) response.destroy();
      else sendStatus(response, 500);
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  let activeCompile: AbortController | undefined;
  const recompile = async () => {
    activeCompile?.abort();
    const controller = new AbortController();
    activeCompile = controller;
    try {
      await compileTypst(typstFile, deckDirectory, controller.signal);
      if (activeCompile === controller) {
        for (const client of reloadClients) client.write("data: reload\n\n");
      }
    } catch (error) {
      if (!controller.signal.aborted) console.error(error);
    } finally {
      if (activeCompile === controller) activeCompile = undefined;
    }
  };
  const watcher = watch(process.cwd(), {
    ignoreInitial: true,
    ignored: (file, stat) =>
      stat
        ? stat.isDirectory()
          ? ignoredDirectories.has(path.basename(file))
          : path.extname(file) !== ".typ"
        : false,
  });
  watcher.on("add", recompile).on("change", recompile).on("unlink", recompile);
  watcher.on("error", console.error);
  server.on("close", () => {
    void watcher.close();
    activeCompile?.abort();
    for (const client of reloadClients) client.end();
  });
  return server;
};
