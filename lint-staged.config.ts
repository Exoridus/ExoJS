import { relative } from 'node:path';

import type { Configuration } from 'lint-staged';

// Authored TypeScript that the ESLint config governs. Anything outside these
// trees (generated output, vendored code, ad-hoc files) goes to Prettier only,
// because a TypeScript file no config block claims would be linted without a
// program and crash the type-aware rules.
const LINTED = /^(?:src|test|examples|scripts|packages|site)\/.+\.(?:ts|tsx|mts|cts)$/u;

// cmd.exe rejects command lines over 8191 characters, and lint-staged runs a
// function task's commands through it on Windows without chunking them itself.
const MAX_FILE_ARGUMENTS_LENGTH = 6000;

const quote = (files: readonly string[]): string => files.map(file => `"${file}"`).join(' ');

const chunked = (command: string, files: readonly string[]): string[] => {
  const commands: string[] = [];
  let chunk: string[] = [];
  let length = 0;

  for (const file of files) {
    if (chunk.length > 0 && length + file.length + 3 > MAX_FILE_ARGUMENTS_LENGTH) {
      commands.push(`${command} ${quote(chunk)}`);
      chunk = [];
      length = 0;
    }

    chunk.push(file);
    length += file.length + 3;
  }

  if (chunk.length > 0) {
    commands.push(`${command} ${quote(chunk)}`);
  }

  return commands;
};

// One task per commit rather than one per glob: ESLint rewrites a file and
// Prettier then reformats the same file, so the two must run in that order.
// Separate globs run concurrently and would race on any file both match.
const config: Configuration = {
  '*': stagedFiles => {
    const files = stagedFiles.map(file => relative(process.cwd(), file).replaceAll('\\', '/'));
    const linted = files.filter(file => LINTED.test(file));
    const commands: string[] = [];

    commands.push(...chunked('eslint --fix --no-warn-ignored --max-warnings=0', linted));
    commands.push(...chunked('prettier --write --ignore-unknown', files));

    return commands;
  },
};

export default config;
