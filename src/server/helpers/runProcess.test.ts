import { describe, expect, it } from "vitest";
import { runProcess } from "./runProcess";

describe("runProcess", () => {
  it("accepts output larger than the Node.js default", async () => {
    const { stdout } = await runProcess(process.execPath, [
      "-e",
      'process.stdout.write("x".repeat(1024 * 1024 + 1))',
    ]);

    expect(stdout).toHaveLength(1024 * 1024 + 1);
  });

  it("rejects output larger than the configured limit", async () => {
    const task = runProcess(process.execPath, [
      "-e",
      'process.stdout.write("x".repeat(17 * 1024 * 1024))',
    ]);

    await expect(task).rejects.toMatchObject({
      code: "ERR_CHILD_PROCESS_STDIO_MAXBUFFER",
      message: "stdout maxBuffer length exceeded",
    });
  });

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
