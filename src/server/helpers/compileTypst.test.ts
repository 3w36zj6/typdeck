import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  assertSupportedTypstVersion,
  compileTypst,
  resolveOutputPath,
} from "./compileTypst";

describe("resolveOutputPath", () => {
  it("resolves symbolic links in output paths", () => {
    using root = fs.mkdtempDisposableSync(
      path.join(os.tmpdir(), "typdeck-output-path-"),
    );
    const target = path.join(root.path, "target");
    const link = path.join(root.path, "link");
    fs.mkdirSync(target);
    fs.symlinkSync(
      target,
      link,
      process.platform === "win32" ? "junction" : "dir",
    );

    expect(resolveOutputPath(path.join(root.path, "output"))).toBe(
      path.join(root.path, "output"),
    );
    expect(resolveOutputPath(link)).toBe(target);
    expect(resolveOutputPath(path.join(link, "output"))).toBe(
      path.join(target, "output"),
    );
  });
});

describe("compileTypst", () => {
  it("requires Typst 0.15.0 or newer", () => {
    expect(() => assertSupportedTypstVersion("typst 0.14.2")).toThrow(
      "typdeck requires Typst 0.15.0 or newer",
    );
    expect(() => assertSupportedTypstVersion("typst 0.15.0")).not.toThrow();
    expect(() => assertSupportedTypstVersion("typst 1.0.0")).not.toThrow();
  });

  it("supports output paths containing spaces", async () => {
    using output = fs.mkdtempDisposableSync(
      path.join(os.tmpdir(), "typdeck output "),
    );

    const input = path.join(process.cwd(), "tests/fixtures/pdfpc-note.typ");
    const compilationInputs = await compileTypst(input, output.path);

    expect(fs.existsSync(path.join(output.path, "deck.pdf"))).toBe(true);
    expect(compilationInputs).toContain(input);
    expect(
      fs.existsSync(path.join(output.path, "compilation-inputs.json")),
    ).toBe(false);
    expect(
      JSON.parse(
        fs.readFileSync(path.join(output.path, "metadata.json"), "utf8"),
      ),
    ).toMatchObject({
      pageCount: 1,
      pageLabels: ["i"],
      title: "Result deck",
      language: "en-GB",
      durationMinutes: 30,
      startTime: "14:10",
      endTime: "14:40",
      lastMinutes: 5,
    });
  });

  it("preserves symbolic input paths for watching", async () => {
    using project = fs.mkdtempDisposableSync(
      path.join(process.cwd(), ".typdeck-symlink-input-"),
    );
    const actual = path.join(project.path, "actual");
    const linked = path.join(project.path, "linked");
    fs.mkdirSync(actual);
    fs.writeFileSync(path.join(actual, "content.txt"), "content");
    fs.symlinkSync(
      actual,
      linked,
      process.platform === "win32" ? "junction" : "dir",
    );
    const input = path.join(project.path, "slides.typ");
    fs.writeFileSync(input, '#read("linked/content.txt")');

    const compilationInputs = await compileTypst(
      input,
      path.join(project.path, "output"),
    );

    expect(compilationInputs).toContain(path.join(linked, "content.txt"));
  });

  it("compiles Slydst 0.1.5 slides", async () => {
    using output = fs.mkdtempDisposableSync(
      path.join(os.tmpdir(), "typdeck-slydst-"),
    );

    await compileTypst(
      path.join(process.cwd(), "tests/fixtures/slydst.typ"),
      output.path,
    );

    expect(
      JSON.parse(
        fs.readFileSync(path.join(output.path, "metadata.json"), "utf8"),
      ),
    ).toMatchObject({
      pageCount: 3,
      outline: [
        { text: "First slide", level: 2, page: 2 },
        { text: "Second slide", level: 2, page: 3 },
      ],
    });
  });

  it("keeps the last good output when compilation fails", async () => {
    const root = process.cwd();
    using output = fs.mkdtempDisposableSync(
      path.join(os.tmpdir(), "typdeck-output-"),
    );

    await compileTypst(
      path.join(root, "tests/fixtures/pdfpc-note.typ"),
      output.path,
    );
    const pdf = fs.readFileSync(path.join(output.path, "deck.pdf"));
    const metadata = fs.readFileSync(
      path.join(output.path, "metadata.json"),
      "utf8",
    );

    await expect(
      compileTypst(path.join(root, "tests/fixtures/invalid.typ"), output.path),
    ).rejects.toThrow();

    expect(fs.readFileSync(path.join(output.path, "deck.pdf"))).toEqual(pdf);
    expect(
      fs.readFileSync(path.join(output.path, "metadata.json"), "utf8"),
    ).toBe(metadata);
    expect(
      fs
        .readdirSync(path.dirname(output.path))
        .some((name) =>
          name.startsWith(`.${path.basename(output.path)}-compile-`),
        ),
    ).toBe(false);
  });
});
