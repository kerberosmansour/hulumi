#!/usr/bin/env node

import { runLiveValidatorCli } from "./live-validator";

runLiveValidatorCli(process.argv.slice(2))
  .then((result) => {
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    process.exit(result.exitCode);
  })
  .catch((err) => {
    process.stderr.write(`hulumi validate live: ${err instanceof Error ? err.message : err}\n`);
    process.exit(1);
  });
