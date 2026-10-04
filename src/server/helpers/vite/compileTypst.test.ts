import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { compileTypst } from "./compileTypst";

const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("compileTypst", () => {
  it("supports output paths containing spaces", async () => {
    const output = fs.mkdtempSync(path.join(os.tmpdir(), "typdeck output "));
    directories.push(output);

    await compileTypst(
      path.join(process.cwd(), "tests/fixtures/pdfpc-note.typ"),
      output,
    );

    expect(fs.existsSync(path.join(output, "deck.pdf"))).toBe(true);
    expect(
      JSON.parse(fs.readFileSync(path.join(output, "metadata.json"), "utf8")),
    ).toMatchObject({ pageCount: 1 });
  });

  it("keeps the last good output when compilation fails", async () => {
    const root = process.cwd();
    const output = fs.mkdtempSync(path.join(os.tmpdir(), "typdeck-output-"));
    directories.push(output);

    await compileTypst(
      path.join(root, "tests/fixtures/pdfpc-note.typ"),
      output,
    );
    const pdf = fs.readFileSync(path.join(output, "deck.pdf"));
    const metadata = fs.readFileSync(
      path.join(output, "metadata.json"),
      "utf8",
    );

    await expect(
      compileTypst(path.join(root, "tests/fixtures/invalid.typ"), output),
    ).rejects.toThrow();

    expect(fs.readFileSync(path.join(output, "deck.pdf"))).toEqual(pdf);
    expect(fs.readFileSync(path.join(output, "metadata.json"), "utf8")).toBe(
      metadata,
    );
    expect(
      fs.readdirSync(output).some((name) => name.startsWith(".compile-")),
    ).toBe(false);
  });
});
