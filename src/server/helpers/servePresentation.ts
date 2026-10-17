import fs from "node:fs";
import http, {
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import path from "node:path";
import { pipeline } from "node:stream";
import send from "@fastify/send";
import { watch } from "chokidar";
import { clientAssets, type ClientAsset } from "../clientAssets";
import { reportError } from "../cliOutput";
import { compileTypst } from "./compileTypst";

const reloadPath = "/__typdeck_reload";
const reloadScript = `<script>new EventSource("${reloadPath}").onmessage=()=>location.reload()</script>`;
const sendStatus = (
  response: ServerResponse,
  status: number,
  headers?: http.OutgoingHttpHeaders,
) => response.writeHead(status, headers).end();

const sendAsset = (
  request: IncomingMessage,
  response: ServerResponse,
  { body, contentType }: ClientAsset,
) => {
  response.writeHead(200, {
    "Cache-Control": "no-store",
    "Content-Length": body.byteLength,
    "Content-Type": contentType,
  });
  response.end(request.method === "HEAD" ? undefined : body);
};

const sendFile = async (
  request: IncomingMessage,
  response: ServerResponse,
  root: string,
  file: string,
) => {
  const result = await send(request, file, { root, index: false });
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

const startServer = async (
  handleRequest: (
    request: IncomingMessage,
    response: ServerResponse,
  ) => Promise<void>,
): Promise<Server> => {
  const server = http.createServer((request, response) => {
    void handleRequest(request, response).catch((error: unknown) => {
      reportError(error);
      if (response.headersSent) response.destroy();
      else sendStatus(response, 500);
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  return server;
};

export const serveDirectory = async (directory: string) => {
  const root = path.resolve(directory);
  if (!fs.statSync(root, { throwIfNoEntry: false })?.isDirectory()) {
    throw new Error(`Invalid build output directory: ${root}`);
  }

  return startServer(async (request, response) => {
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
    await sendFile(
      request,
      response,
      root,
      pathname === "/" ? "/index.html" : pathname,
    );
  });
};

export const servePresentation = async (
  typstFile: string,
  deckDirectory: string,
  compilationInputs: string[],
) => {
  const reloadClients = new Set<ServerResponse>();
  const embeddedIndex = clientAssets.get("/index.html");
  if (!embeddedIndex) throw new Error("Missing embedded client index");
  const index: ClientAsset = {
    body: Buffer.from(
      embeddedIndex.body
        .toString("utf8")
        .replace("</head>", `${reloadScript}</head>`),
    ),
    contentType: embeddedIndex.contentType,
  };
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
      sendAsset(request, response, index);
      return;
    }

    const deckAsset = deckAssets.get(pathname);
    if (deckAsset) {
      await sendFile(request, response, deckDirectory, deckAsset);
      return;
    }

    const clientAsset = clientAssets.get(pathname);
    if (clientAsset) sendAsset(request, response, clientAsset);
    else sendStatus(response, 404);
  };

  const server = await startServer(handleRequest);

  let activeCompile: AbortController | undefined;
  const watchedInputs = new Set(compilationInputs);
  const watcher = watch([...watchedInputs], { ignoreInitial: true });
  const updateWatchedInputs = async (nextInputs: string[]) => {
    const next = new Set(nextInputs);
    await watcher.add([...next].filter((input) => !watchedInputs.has(input)));
    await watcher.unwatch(
      [...watchedInputs].filter((input) => !next.has(input)),
    );
    watchedInputs.clear();
    for (const input of next) watchedInputs.add(input);
  };
  const recompile = async () => {
    activeCompile?.abort();
    const controller = new AbortController();
    activeCompile = controller;
    try {
      const nextInputs = await compileTypst(
        typstFile,
        deckDirectory,
        controller.signal,
      );
      if (activeCompile === controller) {
        await updateWatchedInputs(nextInputs);
        for (const client of reloadClients) client.write("data: reload\n\n");
      }
    } catch (error) {
      if (!controller.signal.aborted) reportError(error);
    } finally {
      if (activeCompile === controller) activeCompile = undefined;
    }
  };
  watcher.on("add", recompile).on("change", recompile).on("unlink", recompile);
  watcher.on("error", reportError);
  server.on("close", () => {
    void watcher.close();
    activeCompile?.abort();
    for (const client of reloadClients) client.end();
  });
  return server;
};
