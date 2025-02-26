import { build, createServer, preview } from "vite";
import yargs from "yargs/yargs";
import { hideBin } from "yargs/helpers";
import { createViteConfig } from "./helpers/vite/createViteConfig";

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
        server.printUrls();
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
        previewServer.printUrls();
      },
    })
    .option("outDir", { type: "string", default: "dist" })
    .demandCommand(1)
    .parse();
};
