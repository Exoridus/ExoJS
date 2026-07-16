// @ts-check
import { pathToFileURL } from 'node:url';

/**
 * CI lane selection — the single source of truth for which validation lanes a
 * set of changed files must trigger.
 *
 * Consumed by:
 *   - the "Detect changes" job in .github/workflows/_ci-checks.yml (run with the
 *     runner's ambient `node`, no `pnpm install`); and
 *   - test/ci/select-lanes.test.ts, which asserts representative changed-file
 *     sets against `selectAreas` / `effectiveLanes`.
 *
 * Written as dependency-free ESM (`.mjs`) on purpose: the detector job runs this
 * with the runner's ambient `node` BEFORE any dependency install, so it must not
 * import anything outside `node:` built-ins. Keep it that way — adding a runtime
 * import here would force a `pnpm install` into the always-on detector job.
 *
 * Background / the defect this prevents:
 * a PR touching only `packages/exojs-tilemap/**` or `packages/exojs-tiled/**`
 * used to leave `engine` false, so the unit, package-verify and browser lanes
 * were skipped while Required CI still went green. The extension packages are
 * runtime engine code (their source is imported by the in-repo unit AND browser
 * tests via the vitest aliases), so a change to them must run the full engine
 * validation set — not just the docs/site lane.
 */

/**
 * @typedef {{ engine: boolean, site: boolean, audioFx: boolean, tilemapWorker: boolean }} LaneAreas
 * @typedef {{
 *   typecheck: boolean,
 *   lint: boolean,
 *   unit: boolean,
 *   coverage: boolean,
 *   browserWebgl2: boolean,
 *   browserWebgpu: boolean,
 *   browserFirefox: boolean,
 *   browserAudio: boolean,
 *   browserTilemapWorker: boolean,
 *   packageVerify: boolean,
 *   siteBuild: boolean,
 * }} EffectiveLanes
 */

/**
 * Runtime workspace packages whose CODE participates in the engine validation
 * lanes (unit tests, package build/verify, browser rendering tests).
 *
 *   - exojs-config    shared vitest/eslint/tsconfig/rollup presets — a change
 *                     here can alter how every package builds, types and tests.
 *   - exojs-particles / exojs-tilemap / exojs-tiled  runtime extension packages
 *                     whose source the in-repo unit and browser tests import.
 *
 * NOT listed: `create-exo-app` (a standalone scaffolding CLI with no engine /
 * browser impact) and `site` (the examples app — covered by the `site` area).
 *
 * Adding a new runtime extension package == add its directory name here. Keep in
 * sync with `LOCKSTEP_PACKAGES` in scripts/release/lockstep-packages.ts (this
 * file is dependency-free ESM and runs before any install, so it cannot import
 * that TS module).
 */
const RUNTIME_PACKAGES = [
  'exojs-config',
  'exojs-particles',
  'exojs-tilemap',
  'exojs-tiled',
  'exojs-physics',
  'exojs-audio-fx',
  'exojs-aseprite',
  'exojs-ldtk',
  'exojs-react',
];

/**
 * Documentation-only files inside a package. A change limited to these must NOT
 * drag in the expensive engine lanes — it still triggers the docs/site lane via
 * the `site` area, because package READMEs feed the generated package API pages.
 * @param {string} file
 */
const isPackageDocPath = file => /^packages\/[^/]+\/(README\.md|CHANGELOG\.md|LICENSE)$/.test(file);

/**
 * Engine area: core runtime code, shared root tooling, and runtime-package CODE.
 * Gates the unit/coverage, package-build-and-verify and browser lanes.
 * @param {string} file
 */
const isEnginePath = file => {
  // Core engine source, in-repo tests (incl. the browser/perf suites that import
  // package source through the vitest aliases), and repo automation scripts.
  if (file.startsWith('src/')) return true;
  if (file.startsWith('test/')) return true;
  if (file.startsWith('scripts/')) return true;
  // A workflow change can alter any lane, so revalidate everything.
  if (file.startsWith('.github/workflows/')) return true;
  // Shared root build / test / type configuration.
  if (file === 'rollup.config.ts' || file === 'vitest.config.ts') return true;
  if (file === 'tsconfig.json' || file === 'tsconfig.test.json' || file === 'tsconfig.eslint.json') return true;
  // Root manifest + lockfile + workspace topology all affect the whole build.
  if (file === 'package.json' || file === 'pnpm-lock.yaml' || file === 'pnpm-workspace.yaml') return true;
  // The release version-coherence tests derive expectations from the root
  // CHANGELOG, so a changelog-only PR must still run the unit lane (a docs-only
  // changelog edit once skipped it and the mismatch only failed on main).
  if (file === 'CHANGELOG.md') return true;
  // Runtime-package CODE (source, tests, build config, manifest) — but not docs.
  for (const pkg of RUNTIME_PACKAGES) {
    if (file.startsWith(`packages/${pkg}/`) && !isPackageDocPath(file)) return true;
  }
  return false;
};

/**
 * Audio-fx area: the browser-audio lane renders the audio-fx worklets through a
 * real OfflineAudioContext in headless Chromium. It is expensive relative to its
 * blast radius, so it gates on a NARROW set — the audio-fx package CODE plus the
 * shared roots that can change how it builds/tests (the vitest config that
 * defines the browser-audio project, the shared config preset, the root
 * manifest/lockfile/workspace, and any workflow change). A change anywhere else
 * in the engine does NOT drag in the browser-audio lane.
 * @param {string} file
 */
const isAudioFxPath = file => {
  if (file.startsWith('.github/workflows/')) return true;
  if (file === 'vitest.config.ts') return true;
  if (file === 'package.json' || file === 'pnpm-lock.yaml' || file === 'pnpm-workspace.yaml') return true;
  if (file.startsWith('packages/exojs-config/')) return true;
  if (file.startsWith('packages/exojs-audio-fx/') && !isPackageDocPath(file)) return true;
  return false;
};

/**
 * Tilemap-worker area: the browser-tilemap-worker lane runs
 * WorkerSampledChunkSource's real-Worker round trip in headless Chromium
 * (jsdom implements neither Worker nor URL.createObjectURL). Narrow gate,
 * same reasoning as isAudioFxPath: expensive relative to its blast radius.
 * @param {string} file
 */
const isTilemapWorkerPath = file => {
  if (file.startsWith('.github/workflows/')) return true;
  if (file === 'vitest.config.ts') return true;
  if (file === 'package.json' || file === 'pnpm-lock.yaml' || file === 'pnpm-workspace.yaml') return true;
  if (file.startsWith('packages/exojs-config/')) return true;
  if (file.startsWith('packages/exojs-tilemap/') && !isPackageDocPath(file)) return true;
  return false;
};

/**
 * Site area: anything that can change the generated examples site / API docs.
 * Gates the site-build lane. Mirrors (and intentionally keeps) the prior `site`
 * filter: every `packages/**` change — docs included — can affect generated docs
 * or example builds.
 * @param {string} file
 */
const isSitePath = file => {
  if (file.startsWith('site/')) return true;
  if (file.startsWith('examples/')) return true;
  if (file.startsWith('packages/')) return true;
  if (file.startsWith('.github/workflows/')) return true;
  if (file === 'tsconfig.guides.json' || file === 'tsconfig.examples.json' || file === 'tsconfig.eslint.json') return true;
  if (file === 'package.json' || file === 'pnpm-lock.yaml' || file === 'pnpm-workspace.yaml') return true;
  return false;
};

/**
 * Classify a list of changed files into the effective validation areas.
 * @param {readonly string[]} changedFiles
 * @returns {LaneAreas}
 */
export function selectAreas(changedFiles) {
  let engine = false;
  let site = false;
  let audioFx = false;
  let tilemapWorker = false;
  for (const raw of changedFiles) {
    // Normalise Windows separators and trim stray whitespace/blank entries.
    const file = String(raw).replace(/\\/g, '/').trim();
    if (file === '') continue;
    if (!engine && isEnginePath(file)) engine = true;
    if (!site && isSitePath(file)) site = true;
    if (!audioFx && isAudioFxPath(file)) audioFx = true;
    if (!tilemapWorker && isTilemapWorkerPath(file)) tilemapWorker = true;
    if (engine && site && audioFx && tilemapWorker) break;
  }
  return { engine, site, audioFx, tilemapWorker };
}

/**
 * Map effective areas to the concrete CI lanes. This MIRRORS the job `if:` gates
 * in _ci-checks.yml — keep the two in sync:
 *   - typecheck + lint are ungated (always run, on every PR);
 *   - unit/coverage, package-verify and all three browser lanes gate on `engine`
 *     (the WebGPU + Firefox browser lanes still run when engine is true; they are
 *     merely `continue-on-error`, i.e. non-blocking, in the workflow);
 *   - site-build gates on `site`;
 *   - the browser-audio lane gates on `audioFx` (a narrow subset of engine).
 * @param {LaneAreas} areas
 * @returns {EffectiveLanes}
 */
export function effectiveLanes(areas) {
  const { engine, site, audioFx, tilemapWorker } = areas;
  return {
    typecheck: true,
    lint: true,
    unit: engine,
    coverage: engine,
    browserWebgl2: engine,
    browserWebgpu: engine,
    browserFirefox: engine,
    browserAudio: audioFx,
    browserTilemapWorker: tilemapWorker,
    packageVerify: engine,
    siteBuild: site,
  };
}

/**
 * Parse the changed-file list emitted by dorny/paths-filter (`list-files: json`)
 * — tolerant of an empty value or a newline-delimited list.
 * @param {string | undefined} raw
 * @returns {string[]}
 */
function parseChangedFiles(raw) {
  const text = (raw ?? '').trim();
  if (text === '') return [];
  if (text.startsWith('[')) {
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) return parsed.map(String);
    } catch {
      // Fall through to newline parsing below.
    }
  }
  return text
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);
}

/**
 * CLI entry: read the event name + changed-file list from the environment and
 * print `engine=<bool>` / `site=<bool>` lines for `$GITHUB_OUTPUT`.
 *
 * On any non-`pull_request` event the changed-file list is irrelevant and every
 * area runs: a push to main, a tag release (via release.yml) or a manual
 * dispatch is always validated in full, never partially.
 */
function main() {
  const eventName = process.env['EVENT_NAME'] ?? '';
  const areas = eventName === 'pull_request' ? selectAreas(parseChangedFiles(process.env['CHANGED_FILES'])) : { engine: true, site: true, audioFx: true, tilemapWorker: true };

  // Human-readable trace to the job log (stderr keeps it out of $GITHUB_OUTPUT).
  process.stderr.write(`select-lanes: event=${eventName || 'unknown'} engine=${areas.engine} site=${areas.site} audioFx=${areas.audioFx} tilemapWorker=${areas.tilemapWorker}\n`);
  process.stdout.write(`engine=${areas.engine}\nsite=${areas.site}\naudioFx=${areas.audioFx}\ntilemapWorker=${areas.tilemapWorker}\n`);
}

// Only run the CLI when executed directly (`node scripts/ci/select-lanes.mjs`),
// never when imported by the test suite.
const invokedPath = process.argv[1];
if (invokedPath && import.meta.url === pathToFileURL(invokedPath).href) {
  main();
}
