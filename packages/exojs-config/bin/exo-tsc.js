#!/usr/bin/env node

// Command-line entry point for the repository's TypeScript compiler, so package
// scripts can name it explicitly instead of inheriting whichever `tsc` the
// installer happened to link. Arguments are forwarded verbatim:
//
//   exo-tsc --noEmit -p tsconfig.json

import { typescriptCompilerVersion, runTypeScriptCompiler } from '../typescript/compiler.js';

// The version flag is the module's own, not the compiler's: `exo-tsc --version`
// has to answer for this repository's contract, while `exo-tsc` with no
// arguments still reaches the compiler, which prints its own version.
if (process.argv.slice(2).includes('--exojs-compiler-version')) {
  process.stdout.write(`${typescriptCompilerVersion()}\n`);
} else {
  process.exit(runTypeScriptCompiler(process.argv.slice(2)).status);
}
