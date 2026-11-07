import { posix } from "node:path";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import type { Metadata } from "../../client/types/metadata";
import { createPresentation } from "./exportPresentation";

const white = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGP4DwQACfsD/fteaysAAAAASUVORK5CYII=",
  "base64",
);
const black = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAX+XDSwAAAABJRU5ErkJggg==",
  "base64",
);
const wide = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAAC0lEQVR4nGP4DwUAI+UH+Yo0eLMAAAAASUVORK5CYII=",
  "base64",
);
const title = "日本語 & <deck>";
const metadata: Metadata = {
  pageCount: 2,
  outline: [],
  slides: {
    "1": { speakerNotes: "Use & <tag>", logicalSlide: 1, overlay: 0 },
    "2": { hidden: true, logicalSlide: 1, overlay: 1 },
  },
};

describe("createPresentation", () => {
  it.each(["pptx", "odp"] as const)(
    "creates a %s deck with each overlay, image, note and hidden marker",
    async (format) => {
      const data = await createPresentation(
        [white, black],
        metadata,
        title,
        format,
      );
      const zip = await JSZip.loadAsync(data);
      if (format === "pptx") {
        expect(
          Object.keys(zip.files).filter((name) =>
            /^ppt\/slides\/slide\d+\.xml$/.test(name),
          ),
        ).toHaveLength(2);
        for (const [index, image] of [white, black].entries()) {
          const page = index + 1;
          const slide = await zip
            .file(`ppt/slides/slide${page}.xml`)!
            .async("string");
          const imageId = slide.match(/<a:blip\b[^>]*\br:embed="([^"]+)"/)![1];
          const rels = await zip
            .file(`ppt/slides/_rels/slide${page}.xml.rels`)!
            .async("string");
          const imageRel = rels
            .match(/<Relationship\b[^>]*>/g)!
            .find((rel) => rel.match(/\bId="([^"]+)"/)?.[1] === imageId)!;
          const target = imageRel.match(/\bTarget="([^"]+)"/)![1];
          expect(
            await zip
              .file(posix.resolve("/ppt/slides", target).slice(1))!
              .async("nodebuffer"),
          ).toEqual(image);
        }
        expect(
          await zip.file("ppt/notesSlides/notesSlide1.xml")!.async("string"),
        ).toContain("Use &amp; &lt;tag&gt;");
        expect(
          await zip.file("ppt/slides/slide2.xml")!.async("string"),
        ).toMatch(/<p:sld\b[^>]*show="0"/);
        expect(await zip.file("docProps/core.xml")!.async("string")).toContain(
          "日本語 &amp; &lt;deck&gt;",
        );
        const presentation = await zip
          .file("ppt/presentation.xml")!
          .async("string");
        const size = presentation.match(/<p:sldSz\b[^>]*>/)![0];
        expect(size).toContain('cx="6350"');
        expect(size).toContain('cy="6350"');
      } else {
        expect(Object.keys(zip.files)[0]).toBe("mimetype");
        expect(data.readUInt16LE(8)).toBe(0);
        expect(data.readUInt16LE(28)).toBe(0);
        expect(await zip.file("mimetype")!.async("string")).toBe(
          "application/vnd.oasis.opendocument.presentation",
        );
        const content = await zip.file("content.xml")!.async("string");
        const pages = content.match(
          /<draw:page(?=\s|>)[\s\S]*?<\/draw:page>/g,
        )!;
        expect(pages).toHaveLength(2);
        for (const [index, image] of [white, black].entries()) {
          const target = pages[index].match(
            /<draw:image\b[^>]*\bxlink:href="([^"]+)"/,
          )![1];
          expect(await zip.file(target)!.async("nodebuffer")).toEqual(image);
        }
        const hiddenStyle = pages[1].match(
          /<draw:page\b[^>]*\bdraw:style-name="([^"]+)"/,
        )![1];
        const style = content
          .match(/<style:style\b[^>]*>[\s\S]*?<\/style:style>/g)!
          .find(
            (entry) =>
              entry.match(/\bstyle:name="([^"]+)"/)?.[1] === hiddenStyle,
          );
        expect(style).toContain('presentation:visibility="hidden"');
        expect(content).toContain(
          'Use<text:s text:c="1"/>&amp;<text:s text:c="1"/>&lt;tag&gt;',
        );
        expect(Number(content.match(/svg:width="([\d.]+)in"/)![1])).toBeCloseTo(
          1 / 144,
        );
        expect(await zip.file("meta.xml")!.async("string")).toContain(
          "日本語 &amp; &lt;deck&gt;",
        );
        expect(
          await zip.file("META-INF/manifest.xml")!.async("string"),
        ).toContain('manifest:version="1.4"');
      }
    },
  );

  it("preserves Unicode, whitespace and literal markup in ODP notes", async () => {
    const data = await createPresentation(
      [white],
      {
        pageCount: 1,
        outline: [],
        slides: {
          "1": {
            speakerNotes:
              "  日本語 😀 & <tag>\t\"quoted\" 'single'\r\n\rTail  ",
          },
        },
      },
      title,
      "odp",
    );
    const zip = await JSZip.loadAsync(data);
    const content = await zip.file("content.xml")!.async("string");
    expect(content).toContain('<text:p><text:s text:c="2"/>日本語');
    expect(content).toContain(
      '😀<text:s text:c="1"/>&amp;<text:s text:c="1"/>&lt;tag&gt;<text:tab/>"quoted"',
    );
    expect(content).toContain("'single'");
    expect(content).toContain(
      '<text:p></text:p><text:p>Tail<text:s text:c="2"/></text:p>',
    );
    expect(content).not.toContain("<tag>");
  });

  it.each(["pptx", "odp"] as const)(
    "rejects inconsistent page sizes for %s",
    async (format) => {
      await expect(
        createPresentation([white, wide], metadata, title, format),
      ).rejects.toThrow("same size");
    },
  );

  it.each(["pptx", "odp"] as const)(
    "requires one image per page for %s",
    async (format) => {
      for (const images of [[], [white], [white, black, white]]) {
        await expect(
          createPresentation(images, metadata, title, format),
        ).rejects.toThrow("page count");
      }
      await expect(
        createPresentation([Buffer.alloc(4), black], metadata, title, format),
      ).rejects.toThrow();
    },
  );

  it.each(["pptx", "odp"] as const)(
    "rejects XML-invalid text in %s notes and titles",
    async (format) => {
      for (const text of ["\0", "\ud800", "\uffff"]) {
        await expect(
          createPresentation([white, black], metadata, text, format),
        ).rejects.toThrow("forbidden in XML 1.0");
        await expect(
          createPresentation(
            [white],
            {
              pageCount: 1,
              outline: [],
              slides: { "1": { speakerNotes: text } },
            },
            title,
            format,
          ),
        ).rejects.toThrow("forbidden in XML 1.0");
      }
    },
  );
});
