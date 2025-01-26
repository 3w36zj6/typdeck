import { build, createServer, preview } from "vite";
import yargs from "yargs/yargs";
import { hideBin } from "yargs/helpers";
import { createConfig } from "./helpers/vite/createConfig";

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
        const config = createConfig(argv.outDir, argv.typstFile, "dev");
        const server = await createServer(config);
        await server.listen();
        server.printUrls();
      },
    })
    .command<BuildArgs>({
      command: "build <typstFile>",
      describe: "build for production",
      handler: async (argv) => {
        const config = createConfig(argv.outDir, argv.typstFile, "build");
        await build(config);
      },
    })
    .command<PreviewArgs>({
      command: "preview",
      describe: "locally preview production build",
      handler: async (argv) => {
        const config = createConfig(argv.outDir, undefined, "preview");
        const previewServer = await preview(config);
        previewServer.printUrls();
      },
    })
    .option("outDir", { type: "string", default: "dist" })
    .demandCommand(1)
    .parse();
};
