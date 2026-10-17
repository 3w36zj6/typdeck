import fs from "node:fs";
import { type Server } from "node:http";
import path from "node:path";
import {
  argument,
  command,
  constant,
  message,
  object,
  option,
  or,
  withDefault,
} from "@optique/core";
import { path as pathValue, run } from "@optique/run";
import { note } from "@clack/prompts";
import { GlobalWorkerOptions } from "pdfjs-dist/legacy/build/pdf.mjs";
import { clientAssets } from "./clientAssets";
import {
  compileTypst,
  replaceDirectory,
  resolveOutputPath,
} from "./helpers/compileTypst";
import { serveDirectory, servePresentation } from "./helpers/servePresentation";

declare const __TYPDECK_VERSION__: string;

const printUrl = (server: Server) => {
  const address = server.address();
  if (!address || typeof address === "string") return;
  note(`http://127.0.0.1:${address.port}/`, "Local");
};

const containsPath = (directory: string, target: string) => {
  const relative = path.relative(directory, target);
  return (
    relative === "" ||
    (relative !== ".." &&
      !relative.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relative))
  );
};

const compileDeck = async (typstFile: string) => {
  const pdfWorker = [...clientAssets].find(
    ([pathname]) =>
      pathname.startsWith("/assets/pdf.worker") && pathname.endsWith(".mjs"),
  )?.[1];
  if (!pdfWorker) throw new Error("Missing embedded PDF worker");
  GlobalWorkerOptions.workerSrc = `data:text/javascript;base64,${pdfWorker.body.toString("base64")}`;

  const dotDirectory = resolveOutputPath(".typdeck");
  const deckDirectory = path.join(dotDirectory, "deck");
  fs.mkdirSync(dotDirectory, { recursive: true });
  fs.writeFileSync(path.join(dotDirectory, ".gitignore"), "*\n", "utf8");
  const compilationInputs = await compileTypst(typstFile, deckDirectory);
  return { compilationInputs, deckDirectory };
};

const buildPresentation = async (typstFile: string, outDir: string) => {
  const output = resolveOutputPath(outDir);
  const project = fs.realpathSync.native(process.cwd());
  const typstInput = fs.realpathSync.native(typstFile);
  if (containsPath(output, project) || containsPath(output, typstInput)) {
    throw new Error(
      "outDir must not contain the project directory or Typst input",
    );
  }
  const { compilationInputs, deckDirectory } = await compileDeck(typstFile);
  if (
    compilationInputs.some((input) =>
      containsPath(output, fs.realpathSync.native(input)),
    )
  ) {
    throw new Error(
      "outDir must not contain the project directory or Typst input",
    );
  }
  fs.mkdirSync(path.dirname(output), { recursive: true });
  using staging = fs.mkdtempDisposableSync(
    path.join(path.dirname(output), `.${path.basename(output)}-build-`),
  );
  for (const [pathname, { body }] of clientAssets) {
    const destination = path.join(staging.path, pathname.slice(1));
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, body);
  }
  fs.cpSync(deckDirectory, staging.path, { recursive: true });
  replaceDirectory(staging.path, output);
};

const outDir = withDefault(
  option("--outDir", pathValue({ metavar: "DIRECTORY" }), {
    description: message`output directory`,
  }),
  "dist",
);

const parser = or(
  command(
    "dev",
    object({
      command: constant("dev"),
      typstFile: argument(pathValue({ metavar: "TYPST_FILE" })),
    }),
    { description: message`start dev server` },
  ),
  command(
    "build",
    object({
      command: constant("build"),
      typstFile: argument(pathValue({ metavar: "TYPST_FILE" })),
      outDir,
    }),
    { description: message`build for production` },
  ),
  command("preview", object({ command: constant("preview"), outDir }), {
    description: message`preview build output`,
  }),
);

export const main = async () => {
  const args = run(parser, {
    aboveError: "none",
    completion: "command",
    help: "option",
    programName: "typdeck",
    showDefault: true,
    version: __TYPDECK_VERSION__,
  });

  switch (args.command) {
    case "dev": {
      const { compilationInputs, deckDirectory } = await compileDeck(
        args.typstFile,
      );
      const server = await servePresentation(
        args.typstFile,
        deckDirectory,
        compilationInputs,
      );
      printUrl(server);
      break;
    }
    case "build":
      await buildPresentation(args.typstFile, args.outDir);
      break;
    case "preview":
      printUrl(await serveDirectory(args.outDir));
      break;
  }
};
