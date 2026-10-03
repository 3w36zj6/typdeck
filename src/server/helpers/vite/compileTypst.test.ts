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
});
