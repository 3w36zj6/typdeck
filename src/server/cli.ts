import {
  build,
  createServer,
  preview,
  PreviewServer,
  ViteDevServer,
} from "vite";
import yargs from "yargs/yargs";
import { hideBin } from "yargs/helpers";
import { createViteConfig } from "./helpers/vite/createViteConfig";
import chalk from "chalk";

const printUrl = (server: ViteDevServer | PreviewServer) => {
  const localUrl = server.resolvedUrls?.local?.[0];
  if (localUrl) {
    const url = new URL(localUrl);
    console.info(
      `${chalk.green("  ➜")}  ${chalk.bold("Local:")}   ${chalk.cyan(`http://${url.hostname}:${chalk.bold(url.port)}/`)}`,
    );
  }
};

type DevArgs = {
  outDir: string;
  typstFile: string;
};

type BuildArgs = {
  outDir: string;
  typstFile: string;
};

type PreviewArgs = {
  outDir: string;
};

export const main = async () => {
  await yargs(hideBin(process.argv))
    .command<DevArgs>({
      command: "dev <typstFile>",
      describe: "start dev server",
      handler: async (argv) => {
        const viteConfig = createViteConfig(argv.outDir, argv.typstFile, "dev");
        const server = await createServer(viteConfig);
        await server.listen();
        printUrl(server);
      },
    })
    .command<BuildArgs>({
      command: "build <typstFile>",
      describe: "build for production",
      handler: async (argv) => {
        const viteConfig = createViteConfig(
          argv.outDir,
          argv.typstFile,
          "build",
        );
        await build(viteConfig);
      },
    })
    .command<PreviewArgs>({
      command: "preview",
      describe: "locally preview production build",
      handler: async (argv) => {
        const viteConfig = createViteConfig(argv.outDir, undefined, "preview");
        const previewServer = await preview(viteConfig);
        printUrl(previewServer);
      },
    })
    .option("outDir", { type: "string", default: "dist" })
    .demandCommand(1)
    .parse();
};
