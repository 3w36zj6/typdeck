import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { compileTypst } from "./compileTypst";

const directories: string[] = [];

afterEach(() => {
  vi.restoreAllMocks();
  for (const directory of directories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("compileTypst", () => {
  it("supports output paths containing spaces", () => {
    const output = fs.mkdtempSync(path.join(os.tmpdir(), "typdeck output "));
    directories.push(output);

    compileTypst(
      path.join(process.cwd(), "tests/fixtures/pdfpc-note.typ"),
      output,
    );

    expect(fs.existsSync(path.join(output, "pages", "1.svg"))).toBe(true);
    expect(
      JSON.parse(fs.readFileSync(path.join(output, "metadata.json"), "utf8")),
    ).toMatchObject({ pageCount: 1 });
  });

  it("keeps the last good output when compilation fails", () => {
    const root = process.cwd();
    const output = fs.mkdtempSync(path.join(os.tmpdir(), "typdeck-output-"));
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    directories.push(output);

    compileTypst(path.join(root, "tests/fixtures/pdfpc-note.typ"), output);
    const page = fs.readFileSync(path.join(output, "pages", "1.svg"));
    const metadata = fs.readFileSync(
      path.join(output, "metadata.json"),
      "utf8",
    );

    expect(() =>
      compileTypst(path.join(root, "tests/fixtures/invalid.typ"), output),
    ).toThrow();

    expect(consoleError).toHaveBeenCalledOnce();
    expect(fs.readFileSync(path.join(output, "pages", "1.svg"))).toEqual(page);
    expect(fs.readFileSync(path.join(output, "metadata.json"), "utf8")).toBe(
      metadata,
    );
    expect(
      fs.readdirSync(output).some((name) => name.startsWith(".compile-")),
    ).toBe(false);
  });
});
