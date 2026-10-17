#!/usr/bin/env node

import { main } from "./src/server/cli";

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
