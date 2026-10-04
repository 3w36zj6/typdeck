import fs from "node:fs";
import { type Server } from "node:http";
import { findPackageJSON } from "node:module";
import path from "node:path";
import yargs from "yargs/yargs";
import { hideBin } from "yargs/helpers";
import chalk from "chalk";
import { compileTypst, replaceDirectory } from "./helpers/compileTypst";
import { serveDirectory, servePresentation } from "./helpers/servePresentation";

const printUrl = (server: Server) => {
  const address = server.address();
  if (!address || typeof address === "string") return;
  console.info(
    `${chalk.green("  ➜")}  ${chalk.bold("Local:")}   ${chalk.cyan(`http://127.0.0.1:${chalk.bold(address.port)}/`)}`,
  );
};

type DevArgs = {
  typstFile: string;
};

type BuildArgs = {
  outDir: string;
  typstFile: string;
};

type PreviewArgs = {
  outDir: string;
};

const getClientDirectory = () => {
  const packageJson = findPackageJSON(import.meta.url);
  if (!packageJson) throw new Error("Could not find typdeck package.json");
  return path.join(path.dirname(packageJson), "public");
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
  const dotDirectory = path.resolve(".typdeck");
  const deckDirectory = path.join(dotDirectory, "deck");
  fs.mkdirSync(dotDirectory, { recursive: true });
  fs.writeFileSync(path.join(dotDirectory, ".gitignore"), "*\n", "utf8");
  await compileTypst(typstFile, deckDirectory);
  return deckDirectory;
};

const buildPresentation = async (typstFile: string, outDir: string) => {
  const deckDirectory = await compileDeck(typstFile);
  const output = path.resolve(outDir);
  if (containsPath(output, process.cwd())) {
    throw new Error("outDir must not contain the project directory");
  }
  fs.mkdirSync(path.dirname(output), { recursive: true });
  using staging = fs.mkdtempDisposableSync(
    path.join(path.dirname(output), `.${path.basename(output)}-build-`),
  );
  fs.cpSync(getClientDirectory(), staging.path, { recursive: true });
  fs.cpSync(deckDirectory, staging.path, { recursive: true });
  replaceDirectory(staging.path, output);
};

export const main = async () => {
  await yargs(hideBin(process.argv))
    .command<DevArgs>({
      command: "dev <typstFile>",
      describe: "start dev server",
      handler: async (argv) => {
        const server = await servePresentation(
          argv.typstFile,
          getClientDirectory(),
          await compileDeck(argv.typstFile),
        );
        printUrl(server);
      },
    })
    .command<BuildArgs>({
      command: "build <typstFile>",
      describe: "build for production",
      handler: async (argv) => {
        await buildPresentation(argv.typstFile, argv.outDir);
      },
    })
    .command<PreviewArgs>({
      command: "preview",
      describe: "preview build output",
      handler: async (argv) => {
        printUrl(await serveDirectory(argv.outDir));
      },
    })
    .option("outDir", {
      type: "string",
      default: "dist",
      describe: "output directory",
    })
    .demandCommand(1)
    .parse();
};
