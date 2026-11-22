// Centralized TypeScript compiler contract for the ExoJS monorepo.
//
// The repository currently carries the classic TypeScript 6 compiler API for
// unported AST/legacy tooling and native TypeScript 7.1 for all CLI typechecking
// and declaration emission. The native 7.1 entry points (sync/ast/factory) are
// validated separately; this wrapper MUST never silently fall back to TS 7.0.
//
// Both packages ship a `tsc` binary, so a bare `tsc` is resolved by the
// installer rather than by intent - and it changed owner silently when the
// native package was added, moving every `tsc` in the repository to the other
// compiler without a line changing. That is why no script may name a compiler
// itself: it comes from here.
//
// The required major is the one version fact allowed to change. When a later
// TypeScript becomes the native compiler, this constant moves and the call sites
// do not.
//
//   import { runTypeScriptCompiler } from '@codexo/exojs-config/typescript/compiler';
//
//   runTypeScriptCompiler(['--noEmit', '-p', 'tsconfig.json'], { cwd });
//   // => { status: 0, output: '' }

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const NATIVE_PACKAGE = '@typescript/native';
const REQUIRED_MAJOR = 7;
const REQUIRED_MINOR = 1;

const require = createRequire(import.meta.url);

/**
 * Reads the installed manifest rather than trusting a `node_modules` layout, so
 * the answer follows the resolved dependency rather than a path convention.
 *
 * @returns {string} the installed version
 */
const readManifestVersion = () => {
  const manifest = require.resolve(`${NATIVE_PACKAGE}/package.json`);
  const { version } = JSON.parse(readFileSync(manifest, 'utf8'));
  if (typeof version !== 'string') throw new Error(`${NATIVE_PACKAGE} has no version in ${manifest}.`);
  return version;
};

/**
 * Absolute path of the native `tsc` entry point, after verifying that it is the
 * expected major version. A silent mismatch would surface as unexplained
 * diagnostics or a differently shaped declaration output, far from the change
 * that caused it.
 *
 * @returns {string} absolute path to the compiler entry point
 */
export const typescriptCompilerPath = () => {
  const version = readManifestVersion();
  const [major, minor] = version.split('.').map(Number);
  if (major !== REQUIRED_MAJOR || minor !== REQUIRED_MINOR) {
    throw new Error(
      `${NATIVE_PACKAGE} must be TypeScript ${REQUIRED_MAJOR}.${REQUIRED_MINOR}.x, found ${version}. ` +
        'Run `pnpm install` and check the alias in the root package.json.',
    );
  }
  // `bin/tsc` is not listed in the package `exports` map, so it cannot be
  // resolved as a subpath; it is reached relative to the manifest instead.
  const bin = join(dirname(require.resolve(`${NATIVE_PACKAGE}/package.json`)), 'bin', 'tsc');
  if (!existsSync(bin)) throw new Error(`${NATIVE_PACKAGE} is installed without bin/tsc at ${bin}.`);
  return bin;
};

/**
 * Reported version of the compiler this module invokes, for diagnostics.
 *
 * @returns {string} e.g. `v7.0.2`
 */
export const typescriptCompilerVersion = () => `v${readManifestVersion()}`;

/**
 * @typedef {object} TypeScriptCompilerResult
 * @property {number} status process exit code
 * @property {string} output combined stdout and stderr
 */

/**
 * Runs the native TypeScript compiler.
 *
 * `stdio` defaults to inheriting the parent's streams so diagnostics reach the
 * operator unchanged; pass `'pipe'` to capture them, which the verification
 * scripts need.
 *
 * @param {readonly string[]} args arguments forwarded to the compiler verbatim
 * @param {{ cwd?: string, stdio?: 'inherit' | 'pipe' }} [options]
 * @returns {TypeScriptCompilerResult}
 */
export const runTypeScriptCompiler = (args, options = {}) => {
  const result = spawnSync(process.execPath, [typescriptCompilerPath(), ...args], {
    cwd: options.cwd,
    stdio: options.stdio ?? 'inherit',
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  return { status: result.status ?? 1, output: `${result.stdout ?? ''}${result.stderr ?? ''}` };
};
