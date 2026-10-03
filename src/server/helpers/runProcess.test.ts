import { describe, expect, it } from "vitest";
import { runProcess } from "./runProcess";

describe("runProcess", () => {
  it("cancels an active child process", async () => {
    const controller = new AbortController();
    const task = runProcess(
      process.execPath,
      ["-e", "setTimeout(() => {}, 10_000)"],
      controller.signal,
    );

    controller.abort();
    await expect(task).rejects.toMatchObject({ name: "AbortError" });
  });
});
