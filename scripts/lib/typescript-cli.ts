/**
 * Single owner of the TypeScript 7 native compiler CLI.
 *
 * The repository carries two compilers side by side: `typescript` is the
 * TypeScript 6 JavaScript Compiler API, `@typescript/native` is the TypeScript 7
 * native compiler. Both ship a `tsc` binary, so a bare `tsc` on `PATH` or in
 * `node_modules/.bin` is resolved by the installer rather than by intent, and
 * it silently changed owner when the native package was added. Every executable
 * compiler call must go through this module instead.
 *
 * Resolution reads the installed package manifest rather than hard-coding a
 * `node_modules` layout, and then verifies the major version. A silent major
 * mismatch would otherwise surface as unexplained diagnostics or a differently
 * shaped declaration output, far from the change that caused it.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const NATIVE_PACKAGE = '@typescript/native';
const REQUIRED_MAJOR = 7;
const require = createRequire(import.meta.url);

const readManifestVersion = (): string => {
  const manifest = require.resolve(`${NATIVE_PACKAGE}/package.json`);
  const { version } = JSON.parse(readFileSync(manifest, 'utf8')) as { version?: string };
  if (typeof version !== 'string') throw new Error(`${NATIVE_PACKAGE} has no version in ${manifest}.`);
  return version;
};

/** Absolute path of the TypeScript 7 `tsc` entry point. */
export const nativeTscPath = (): string => {
  const version = readManifestVersion();
  const major = Number.parseInt(version, 10);
  if (major !== REQUIRED_MAJOR) {
    throw new Error(`${NATIVE_PACKAGE} must be TypeScript ${REQUIRED_MAJOR}.x, found ${version}. Run \`pnpm install\` and check the alias in package.json.`);
  }
  // `bin/tsc` is not listed in the package `exports` map, so it cannot be
  // resolved as a subpath; it is reached relative to the manifest instead.
  const bin = join(dirname(require.resolve(`${NATIVE_PACKAGE}/package.json`)), 'bin', 'tsc');
  if (!existsSync(bin)) throw new Error(`${NATIVE_PACKAGE} is installed without bin/tsc at ${bin}.`);
  return bin;
};

/** Reported version of the compiler this module invokes, for diagnostics. */
export const nativeTscVersion = (): string => `v${readManifestVersion()}`;

export interface NativeTscResult {
  readonly status: number;
  readonly output: string;
}

/**
 * Runs the TypeScript 7 compiler. `stdio` defaults to inheriting the parent's
 * streams so diagnostics reach the operator unchanged; pass `'pipe'` to capture
 * them, which the verification scripts need.
 */
export const runNativeTsc = (args: readonly string[], options: { readonly cwd?: string; readonly stdio?: 'inherit' | 'pipe' } = {}): NativeTscResult => {
  const result = spawnSync(process.execPath, [nativeTscPath(), ...args], {
    cwd: options.cwd,
    stdio: options.stdio ?? 'inherit',
    encoding: 'utf8',
  });
  if (result.error) throw result.error;
  return { status: result.status ?? 1, output: `${result.stdout ?? ''}${result.stderr ?? ''}` };
};
