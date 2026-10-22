import fs from "node:fs";
import { type Server } from "node:http";
import { networkInterfaces } from "node:os";
import path from "node:path";
import {
  argument,
  command,
  commandLine,
  constant,
  lineBreak,
  message,
  object,
  option,
  or,
  withDefault,
} from "@optique/core";
import { path as pathValue, run } from "@optique/run";
import { note } from "@clack/prompts";
import { clientAssets } from "./clientAssets";
import {
  compileTypst,
  replaceDirectory,
  resolveOutputPath,
} from "./helpers/compileTypst";
import { serveDirectory, servePresentation } from "./helpers/servePresentation";

declare const __TYPDECK_VERSION__: string;

const printUrls = (server: Server, host: boolean) => {
  const address = server.address();
  if (!address || typeof address === "string") return;
  note(`http://127.0.0.1:${address.port}/`, "Local");
  if (!host) {
    note("use --host to expose", "Network");
    return;
  }
  const hosts = new Set(
    Object.values(networkInterfaces())
      .flatMap((entries) => entries ?? [])
      .filter((entry) => entry.family === "IPv4" && !entry.internal)
      .map((entry) => entry.address),
  );
  if (hosts.size) {
    note(
      [...hosts].map((host) => `http://${host}:${address.port}/`).join("\n"),
      "Network",
    );
  }
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

const host = option("--host", {
  description: message`expose the server to the network`,
});

const typstFile = pathValue({
  errors: {
    pathNotFound: (input) =>
      message`Typst file does not exist: ${input}${lineBreak()}Please check the path and try again.`,
  },
  metavar: "TYPST_FILE",
  mustExist: true,
  type: "file",
});

const parser = or(
  command(
    "dev",
    object({
      command: constant("dev"),
      typstFile: argument(typstFile),
      host,
    }),
    { description: message`start dev server` },
  ),
  command(
    "build",
    object({
      command: constant("build"),
      typstFile: argument(typstFile),
      outDir,
    }),
    { description: message`build for production` },
  ),
  command("preview", object({ command: constant("preview"), outDir, host }), {
    description: message`preview build output`,
  }),
);

export const main = async () => {
  const cliArgs = process.argv.slice(2);
  const args = run(parser, {
    args: cliArgs.length === 0 ? ["--help"] : cliArgs,
    aboveError: "none",
    brief: message`Compile Typst slides into a web stage and presenter view.`,
    completion: "command",
    examples: message`${commandLine("typdeck dev main.typ")}${lineBreak()}${commandLine("typdeck build main.typ")}${lineBreak()}${commandLine("typdeck preview")}`,
    help: { option: { names: ["-h", "--help"] } },
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
        args.host,
      );
      printUrls(server, args.host);
      break;
    }
    case "build":
      await buildPresentation(args.typstFile, args.outDir);
      break;
    case "preview":
      printUrls(await serveDirectory(args.outDir, args.host), args.host);
      break;
  }
};
