import fs from "node:fs";
import path from "node:path";
import { log, spinner } from "@clack/prompts";
import { getDocument } from "unpdf/pdfjs";
import * as v from "valibot";
import { parseMetadata, type Metadata } from "../../client/types/metadata.ts";
import { queryPdfpcMetadata } from "./queryPdfpcMetadata.ts";
import { queryTypstHeadings } from "./queryTypstHeadings.ts";
import { runProcess } from "./runProcess.ts";

const CompilationInputsSchema = v.object({
  inputs: v.array(v.string()),
});

const existingAncestor = (candidate: string): string => {
  if (fs.lstatSync(candidate, { throwIfNoEntry: false })) return candidate;
  const parent = path.dirname(candidate);
  return parent === candidate ? candidate : existingAncestor(parent);
};

export const resolveOutputPath = (candidate: string): string => {
  const output = path.resolve(candidate);
  const ancestor = existingAncestor(output);
  return path.resolve(
    fs.realpathSync.native(ancestor),
    path.relative(ancestor, output),
  );
};

export const assertSupportedTypstVersion = (output: string): void => {
  const match = /^typst (\d+)\.(\d+)\.(\d+)(?:\s|$)/.exec(output.trim());
  if (!match || (Number(match[1]) === 0 && Number(match[2]) < 15)) {
    throw new Error("typdeck requires Typst 0.15.0 or newer");
  }
};

let typstVersionCheck: Promise<void> | undefined;

const ensureSupportedTypstVersion = (): Promise<void> =>
  (typstVersionCheck ??= runProcess("typst", ["--version"]).then(({ stdout }) =>
    assertSupportedTypstVersion(stdout),
  ));

export const replaceDirectory = (source: string, destination: string) => {
  const output = resolveOutputPath(destination);
  const backup = `${source}-previous`;
  const hasPrevious = fs.existsSync(output);

  if (hasPrevious) fs.renameSync(output, backup);
  try {
    fs.renameSync(source, output);
  } catch (error) {
    if (hasPrevious) fs.renameSync(backup, output);
    throw error;
  }
  fs.rmSync(backup, { recursive: true, force: true });
};

export const compileTypst = async (
  typstFile: string,
  publicDir: string,
  signal?: AbortSignal,
): Promise<string[]> => {
  await ensureSupportedTypstVersion();
  const resolvedPublicDir = resolveOutputPath(publicDir);
  fs.mkdirSync(path.dirname(resolvedPublicDir), { recursive: true });
  using staging = fs.mkdtempDisposableSync(
    path.join(
      path.dirname(resolvedPublicDir),
      `.${path.basename(resolvedPublicDir)}-compile-`,
    ),
  );
  const stagingDir = staging.path;

  const pdfPath = path.join(stagingDir, "deck.pdf");
  const compilationInputsPath = path.join(
    stagingDir,
    "compilation-inputs.json",
  );
  const args = [
    "compile",
    "--root",
    process.cwd(),
    typstFile,
    pdfPath,
    "--format",
    "pdf",
    "--deps",
    compilationInputsPath,
    "--deps-format",
    "json",
  ];
  const filename = path.basename(typstFile);
  const compilation = process.stdout.isTTY
    ? spinner({ indicator: "timer", signal })
    : undefined;
  compilation?.start(`Compiling ${filename}`);
  if (!compilation) log.step(`Compiling ${filename}`);
  const { stdout, stderr } = await runProcess("typst", args, signal).then(
    (result) => {
      compilation?.stop(`Compiled ${filename}`);
      return result;
    },
    (error: unknown) => {
      if (!signal?.aborted) compilation?.error("Compilation failed");
      throw error;
    },
  );
  if (stderr.trim()) log.warn(stderr.trim(), { output: process.stderr });
  if (stdout.trim()) log.info(stdout.trim());
  const compilationInputs = v
    .parse(
      CompilationInputsSchema,
      JSON.parse(fs.readFileSync(compilationInputsPath, "utf8")),
    )
    .inputs.map((input) => path.resolve(input));
  fs.unlinkSync(compilationInputsPath);

  const pdfTask = getDocument({
    data: new Uint8Array(fs.readFileSync(pdfPath)),
  });
  const pdfMetadata = pdfTask.promise.then(async (document) => {
    const [labels, { info }] = await Promise.all([
      document.getPageLabels(),
      document.getMetadata(),
    ]);
    const title =
      "Title" in info && typeof info.Title === "string"
        ? info.Title.trim() || undefined
        : undefined;
    const language =
      "Language" in info && typeof info.Language === "string"
        ? info.Language.trim() || undefined
        : undefined;
    return {
      pageCount: document.numPages,
      pageLabels: labels ?? undefined,
      title,
      language,
    };
  });

  const [{ pageCount, pageLabels, title, language }, outline, pdfpc] =
    await Promise.all([
      pdfMetadata.finally(() => pdfTask.destroy()),
      queryTypstHeadings(typstFile, process.cwd(), signal),
      queryPdfpcMetadata(typstFile, process.cwd(), signal),
    ]);
  const { slides: pdfpcSlides, ...presentation } = pdfpc;
  const slides: NonNullable<Metadata["slides"]> = Object.fromEntries(
    pdfpcSlides
      .filter(({ page }) => page <= pageCount)
      .map(({ page, ...slide }) => [`${page}`, slide]),
  );
  const metadata = parseMetadata({
    pageCount,
    ...(pageLabels === undefined ? {} : { pageLabels }),
    ...(title === undefined ? {} : { title }),
    ...(language === undefined ? {} : { language }),
    ...presentation,
    outline,
    ...(Object.keys(slides).length > 0 ? { slides } : {}),
  });

  fs.writeFileSync(
    path.join(stagingDir, "metadata.json"),
    JSON.stringify(metadata),
  );
  replaceDirectory(stagingDir, resolvedPublicDir);
  log.success("Compiled presentation");
  return compilationInputs;
};
