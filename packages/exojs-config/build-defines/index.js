// Centralized build-constant resolution and serialization for the ExoJS
// monorepo. Narrowly scoped: one function per concern, zero side effects,
// consumable without a build step. Every Rollup/Vite/Vitest configuration in
// the repository delegates here so there is exactly one place to audit.
//
//   import { createBuildDefines, resolveRevision } from '@codexo/exojs-config/build-defines';
//
//   createBuildDefines({ mode: 'production', version: '0.12.0', revision: 'a31f92c8' });
//   // => { __DEV__: 'false', __VERSION__: '"0.12.0"', __REVISION__: '"a31f92c8"' }

import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// ---- command runner (injectable for tests) ---------------------------------

/**
 * Minimal inline command-runner interface — intentionally compatible with the
 * wider `CommandRunner` from scripts/release without pulling it in as a
 * dependency. Configuration files that need a runner can pass an adapter.
 *
 * @typedef {{ exec(cmd: string, args: string[], cwd?: string): { code: number; stdout: string; stderr: string } }} MiniRunner
 */

/**
 * @param {{ cwd?: string, runner?: MiniRunner }} opts
 * @returns {{ code: number; stdout: string; stderr: string }}
 */
const run = (cmd, args, { cwd, runner } = {}) => {
  if (runner) return runner.exec(cmd, args, cwd);
  try {
    const stdout = execSync(`${cmd} ${args.join(' ')}`, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    return { code: 0, stdout, stderr: '' };
  } catch (e) {
    return { code: e.status ?? 1, stdout: e.stdout?.trim() ?? '', stderr: e.stderr?.trim() ?? '' };
  }
};

// ---- mode validation -------------------------------------------------------

/** @param {string} mode */
export const isValidMode = (mode) => mode === 'development' || mode === 'production';

/**
 * @param {string} mode
 * @returns {'development' | 'production'}
 */
export const validateMode = (mode) => {
  if (!isValidMode(mode)) throw new Error(`Invalid build mode "${mode}". Expected "development" or "production".`);
  return mode;
};

// ---- version resolution ----------------------------------------------------

/**
 * Reads the `version` field from a package.json file.
 * @param {string} packageDir - directory containing package.json
 * @returns {string}
 */
export const resolveVersion = (packageDir) => {
  try {
    const pkg = JSON.parse(readFileSync(resolve(packageDir, 'package.json'), 'utf8'));
    return typeof pkg.version === 'string' ? pkg.version : '0.0.0';
  } catch {
    return '0.0.0';
  }
};

// ---- revision resolution ---------------------------------------------------

const CI_SHA_ENV_VARS = ['EXOJS_REVISION', 'GITHUB_SHA', 'CI_COMMIT_SHA', 'GIT_COMMIT', 'BITBUCKET_COMMIT'];

/**
 * Finds the first recognized CI commit SHA from environment variables.
 * @returns {string | undefined}
 */
const ciShaEnv = () => {
  for (const key of CI_SHA_ENV_VARS) {
    const value = process.env[key];
    if (value && value.length >= 7) return value;
  }
  return undefined;
};

/**
 * @param {{ cwd?: string, runner?: MiniRunner }} opts
 * @returns {string}
 */
const gitRevParse = ({ cwd, runner } = {}) => {
  const result = run('git', ['rev-parse', 'HEAD'], { cwd, runner });
  return result.code === 0 ? result.stdout : undefined;
};

/**
 * Resolves the source revision using this priority:
 * 1. EXOJS_REVISION env var (explicit build/release input)
 * 2. Recognized CI commit SHA
 * 3. git rev-parse HEAD
 * 4. "unknown"
 *
 * Returns the FULL SHA so downstream code can abbreviate it as needed.
 *
 * @param {{ cwd?: string, runner?: MiniRunner }} opts
 * @returns {string}
 */
export const resolveRevision = (opts = {}) => {
  const explicit = process.env['EXOJS_REVISION'];
  if (explicit) return explicit;

  const ci = ciShaEnv();
  if (ci) return ci;

  const git = gitRevParse(opts);
  if (git) return git;

  return 'unknown';
};

// ---- dirty-tree detection --------------------------------------------------

/**
 * @param {{ cwd?: string, runner?: MiniRunner }} opts
 * @returns {boolean}
 */
export const isTreeDirty = ({ cwd, runner } = {}) => {
  // When the revision was provided explicitly (EXOJS_REVISION env var), the
  // caller asserts the value — we do not second-guess by checking the tree.
  if (process.env['EXOJS_REVISION']) return false;

  // When the revision comes from a CI SHA, local dirty-detection via
  // `git diff-index` is meaningless because CI checkouts are shallow or
  // detached. Trust the CI-provided SHA.
  if (ciShaEnv()) return false;

  // Short-circuit: when revision is already "unknown" the dirty flag is
  // meaningless — the tree could not be compared to a reference.
  const rev = resolveRevision({ cwd, runner });
  if (rev === 'unknown') return false;

  // git diff-index: exit 0 = clean, exit 1 = dirty
  const result = run('git', ['diff-index', '--quiet', 'HEAD', '--'], { cwd, runner });
  return result.code !== 0;
};

// ---- short-revision helper -------------------------------------------------

/**
 * Returns the short (7-char) form of a revision, appending "-dirty" when the
 * tree has uncommitted changes. Produces the canonical display revision:
 *
 *   a31f92c8          — clean local build
 *   a31f92c8-dirty    — local build with tracked changes
 *   unknown           — no Git metadata available
 *
 * @param {{ cwd?: string, runner?: MiniRunner }} opts
 * @returns {string}
 */
export const resolveShortRevision = (opts = {}) => {
  const rev = resolveRevision(opts);
  if (rev === 'unknown') return 'unknown';

  // Use the first 7 chars of the full SHA. When the input is already a short
  // CI SHA (GITHUB_SHA, etc.) this is a no-op; when it's a full 40-char SHA
  // this abbreviates it for runtime display.
  const short = rev.length >= 7 ? rev.slice(0, 7) : rev;

  const dirty = isTreeDirty(opts);
  return dirty ? `${short}-dirty` : short;
};

// ---- define serialization --------------------------------------------------

/**
 * Creates a replacement-values map suitable for @rollup/plugin-replace or
 * Vite's `define`. Every value is a valid source-code expression string.
 *
 * @param {{ mode: 'development' | 'production', version: string, revision: string }} opts
 * @returns {{ __DEV__: string, __VERSION__: string, __REVISION__: string }}
 */
export const createBuildDefines = ({ mode, version, revision }) => {
  validateMode(mode);
  return {
    __DEV__: JSON.stringify(mode === 'development'),
    __VERSION__: JSON.stringify(version),
    __REVISION__: JSON.stringify(revision),
  };
};

/**
 * One-shot convenience: resolves version + revision from the local filesystem
 * and returns ready-to-use defines.
 *
 * @param {{ mode: 'development' | 'production', packageDir: string, cwd?: string, runner?: MiniRunner }} opts
 * @returns {{ __DEV__: string, __VERSION__: string, __REVISION__: string }}
 */
export const createBuildDefinesFromRepo = ({ mode, packageDir, cwd, runner }) =>
  createBuildDefines({
    mode,
    version: resolveVersion(packageDir),
    revision: resolveShortRevision({ cwd: cwd ?? packageDir, runner }),
  });
