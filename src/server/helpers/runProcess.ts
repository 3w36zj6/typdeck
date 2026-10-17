import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const maxBuffer = 16 * 1024 * 1024;

export const runProcess = (
  executable: string,
  args: string[],
  signal?: AbortSignal,
): Promise<{ stderr: string; stdout: string }> =>
  execFileAsync(executable, args, { encoding: "utf8", maxBuffer, signal });
