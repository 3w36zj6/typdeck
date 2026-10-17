import { log } from "@clack/prompts";

export const reportError = (error: unknown): void =>
  log.error(error instanceof Error ? error.message : String(error), {
    output: process.stderr,
  });
