import fs from "node:fs";
import path from "node:path";
import JSZip from "jszip";
import pptxgen from "pptxgenjs";
import { parseMetadata, type Metadata } from "../../client/types/metadata.ts";
import { resolveOutputPath } from "./compileTypst.ts";
import { runProcess } from "./runProcess.ts";

const ppi = 144;

const xmlText = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");

const createOdp = async (
  images: Buffer[],
  metadata: Metadata,
  title: string,
  width: number,
  height: number,
): Promise<Buffer> => {
  const zip = new JSZip();
  const mediaType = "application/vnd.oasis.opendocument.presentation";
  zip.file("mimetype", mediaType, { compression: "STORE" });
  const pages = images.map((image, index) => {
    const page = index + 1;
    const details = metadata.slides?.[`${page}` as `${number}`];
    zip.file(`Pictures/page-${page}.png`, image, {
      compression: "STORE",
      createFolders: false,
    });
    const notes = details?.speakerNotes
      ? `<presentation:notes><draw:frame presentation:class="notes" svg:x="1cm" svg:y="1cm" svg:width="19cm" svg:height="27cm"><draw:text-box>${details.speakerNotes
          .split(/\r\n?|\n/)
          .map(
            (line) =>
              `<text:p>${xmlText(line)
                .replaceAll("\t", "<text:tab/>")
                .replace(
                  / +/g,
                  (spaces) => `<text:s text:c="${spaces.length}"/>`,
                )}</text:p>`,
          )
          .join("")}</draw:text-box></draw:frame></presentation:notes>`
      : "";
    return `<draw:page draw:name="slide${page}" draw:master-page-name="Default"${details?.hidden ? ' draw:style-name="Hidden"' : ""}>
      <draw:frame svg:x="0in" svg:y="0in" svg:width="${width}in" svg:height="${height}in"><draw:image xlink:href="Pictures/page-${page}.png" xlink:type="simple" xlink:show="embed" xlink:actuate="onLoad"/></draw:frame>${notes}
    </draw:page>`;
  });
  zip.file(
    "content.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
    <office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0" xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:presentation="urn:oasis:names:tc:opendocument:xmlns:presentation:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:xlink="http://www.w3.org/1999/xlink" office:version="1.4">
      <office:automatic-styles><style:style style:name="Hidden" style:family="drawing-page"><style:drawing-page-properties presentation:visibility="hidden"/></style:style></office:automatic-styles>
      <office:body><office:presentation>${pages.join("")}</office:presentation></office:body>
    </office:document-content>`,
  );
  zip.file(
    "styles.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
    <office:document-styles xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" xmlns:presentation="urn:oasis:names:tc:opendocument:xmlns:presentation:1.0" office:version="1.4">
      <office:automatic-styles>
        <style:page-layout style:name="Slide"><style:page-layout-properties fo:page-width="${width}in" fo:page-height="${height}in" fo:margin="0in" style:print-orientation="${width >= height ? "landscape" : "portrait"}"/></style:page-layout>
        <style:page-layout style:name="Notes"><style:page-layout-properties fo:page-width="21cm" fo:page-height="29.7cm" fo:margin="0cm" style:print-orientation="portrait"/></style:page-layout>
      </office:automatic-styles>
      <office:master-styles><style:master-page style:name="Default" style:page-layout-name="Slide"><presentation:notes style:page-layout-name="Notes"/></style:master-page></office:master-styles>
    </office:document-styles>`,
  );
  zip.file(
    "meta.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
    <office:document-meta xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:dc="http://purl.org/dc/elements/1.1/" office:version="1.4"><office:meta><dc:title>${xmlText(title)}</dc:title></office:meta></office:document-meta>`,
  );
  zip.file(
    "META-INF/manifest.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
    <manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.4">
      <manifest:file-entry manifest:full-path="/" manifest:media-type="${mediaType}" manifest:version="1.4"/>
      ${["content.xml", "styles.xml", "meta.xml"].map((name) => `<manifest:file-entry manifest:full-path="${name}" manifest:media-type="text/xml"/>`).join("")}
      ${images.map((_, index) => `<manifest:file-entry manifest:full-path="Pictures/page-${index + 1}.png" manifest:media-type="image/png"/>`).join("")}
    </manifest:manifest>`,
    { createFolders: false },
  );
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
};

export const createPresentation = async (
  images: Buffer[],
  metadata: Metadata,
  title: string,
  format: "pptx" | "odp",
): Promise<Buffer> => {
  if (images.length === 0 || images.length !== metadata.pageCount) {
    throw new Error("Page images must match the metadata page count");
  }
  const texts = [
    title,
    ...Object.values(metadata.slides ?? {}).map(
      (slide) => slide?.speakerNotes ?? "",
    ),
  ];
  if (
    texts.some((text) =>
      // eslint-disable-next-line no-control-regex -- Reject characters forbidden in XML 1.0.
      /[\u0000-\u0008\u000b\u000c\u000e-\u001f\ud800-\udfff\ufffe\uffff]/u.test(
        text,
      ),
    )
  ) {
    throw new Error(
      "Presentation text contains a character forbidden in XML 1.0",
    );
  }
  let width = 0;
  let height = 0;
  for (const image of images) {
    const pageWidth = image.readUInt32BE(16);
    const pageHeight = image.readUInt32BE(20);
    if (
      !pageWidth ||
      !pageHeight ||
      (width && (pageWidth !== width || pageHeight !== height))
    ) {
      throw new Error(
        `${format.toUpperCase()} requires every Typst page to have the same size`,
      );
    }
    width = pageWidth;
    height = pageHeight;
  }
  if (format === "odp") {
    return createOdp(images, metadata, title, width / ppi, height / ppi);
  }
  const pptx = new pptxgen();
  pptx.title = title;
  pptx.defineLayout({
    name: "TYPST",
    width: width / ppi,
    height: height / ppi,
  });
  pptx.layout = "TYPST";
  for (const [index, image] of images.entries()) {
    const slide = pptx.addSlide();
    slide.addImage({
      data: `image/png;base64,${image.toString("base64")}`,
      x: 0,
      y: 0,
      w: width / ppi,
      h: height / ppi,
    });
    const details = metadata.slides?.[`${index + 1}` as `${number}`];
    if (details?.speakerNotes) slide.addNotes(details.speakerNotes);
    if (details?.hidden) slide.hidden = true;
  }
  return pptx.write({ outputType: "nodebuffer" }) as Promise<Buffer>;
};

export const exportPresentation = async (
  typstFile: string,
  deckDirectory: string,
  compilationInputs: string[],
  destination: string,
  format: "pptx" | "odp",
) => {
  const output = resolveOutputPath(destination);
  const formatName = format.toUpperCase();
  if (path.extname(output).toLowerCase() !== `.${format}`) {
    throw new Error(`${formatName} output must have a .${format} extension`);
  }
  if (
    compilationInputs.some((input) => fs.realpathSync.native(input) === output)
  ) {
    throw new Error(`${formatName} output must not overwrite a Typst input`);
  }

  const metadata = parseMetadata(
    JSON.parse(
      fs.readFileSync(path.join(deckDirectory, "metadata.json"), "utf8"),
    ),
  );
  fs.mkdirSync(path.dirname(output), { recursive: true });
  using staging = fs.mkdtempDisposableSync(
    path.join(path.dirname(output), `.${path.basename(output)}-convert-`),
  );
  await runProcess("typst", [
    "compile",
    "--root",
    process.cwd(),
    typstFile,
    path.join(staging.path, "page-{p}.png"),
    "--format",
    "png",
    "--ppi",
    String(ppi),
  ]);

  const images = Array.from({ length: metadata.pageCount }, (_, index) =>
    fs.readFileSync(path.join(staging.path, `page-${index + 1}.png`)),
  );
  const temporaryOutput = path.join(staging.path, `deck.${format}`);
  fs.writeFileSync(
    temporaryOutput,
    await createPresentation(
      images,
      metadata,
      metadata.title ?? path.parse(typstFile).name,
      format,
    ),
  );
  fs.renameSync(temporaryOutput, output);
};
