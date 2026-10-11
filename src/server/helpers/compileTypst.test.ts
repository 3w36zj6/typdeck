import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { assertSupportedTypstVersion, compileTypst } from "./compileTypst";

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
    });
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
