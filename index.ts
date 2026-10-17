#!/usr/bin/env node

import { main } from "./src/server/cli";
import { reportError } from "./src/server/cliOutput";

main().catch((error: unknown) => {
  reportError(error);
  process.exitCode = 1;
});
