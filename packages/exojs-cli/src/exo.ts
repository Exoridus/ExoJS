#!/usr/bin/env node
import { runCli } from './cli.js';

// `exitCode` rather than `process.exit`, so a pending stdout write is not cut
// off, and so `exo serve` keeps running on its listening socket.
runCli(process.argv.slice(2))
  .then(code => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
