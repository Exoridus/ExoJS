/**
 * Deterministic verification of the coordinated release package matrix.
 *
 * Asserts — without publishing anything — that the release automation actually
 * handles every official package, in the right order, with coherent versions,
 * via the two-stage build-once pipeline:
 *
 *  1. The three official packages (@codexo/exojs, -particles, -tiled) share one
 *     lockstep version.
 *  2. Each extension's peerDependencies["@codexo/exojs"] is "<major>.<minor>.x".
 *  3. create-exo-app is versioned independently (a different version line).
 *  4. release.yml builds all three packages in the PREPARE stage.
 *  5. PREPARE runs `release:prepare` (packs three tarballs + Full ZIP) and
 *     uploads the artifacts.
 *  6. PUBLISH consumes those artifacts (`download-artifact` + `release:publish`)
 *     and never rebuilds.
 *  7. The publish order Core → Particles → Tiled is the canonical PUBLISH_ORDER.
 *
 * Read-only: safe to run in dry-run/CI. Exits non-zero on any inconsistency.
 *
 * Usage: `pnpm verify:release-matrix`
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PUBLISH_ORDER } from './release/manifest.ts';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');

interface Pkg {
  name: string;
  version: string;
  peer?: string;
}

const readPkg = (relPath: string): Pkg => {
  const raw = JSON.parse(readFileSync(resolve(rootDir, relPath), 'utf8')) as {
    name: string;
    version: string;
    peerDependencies?: Record<string, string>;
  };
  return { name: raw.name, version: raw.version, peer: raw.peerDependencies?.['@codexo/exojs'] };
};

const problems: string[] = [];
const ok: string[] = [];

const core = readPkg('package.json');
const particles = readPkg('packages/exojs-particles/package.json');
const tiled = readPkg('packages/exojs-tiled/package.json');
const createExoApp = readPkg('packages/create-exo-app/package.json');

const official = [core, particles, tiled];

// 1. Lockstep version.
const versions = new Set(official.map(p => p.version));
if (versions.size !== 1) {
  problems.push(`Lockstep version mismatch: ${official.map(p => `${p.name}@${p.version}`).join(', ')}`);
} else {
  ok.push(`lockstep version v${[...versions][0]} across ${official.length} official packages`);
}

const version = core.version;
const [major, minor] = version.split('.');
const expectedPeer = `${major}.${minor}.x`;

// 2. Extension peer ranges.
for (const ext of [particles, tiled]) {
  if (ext.peer !== expectedPeer) {
    problems.push(`${ext.name}: peer "@codexo/exojs" is "${ext.peer ?? '(missing)'}", expected "${expectedPeer}"`);
  } else {
    ok.push(`${ext.name} peer range "${expectedPeer}"`);
  }
}

// 3. create-exo-app independence.
if (createExoApp.version === version) {
  problems.push(`create-exo-app must be versioned independently, but matches the lockstep version ${version}.`);
} else {
  ok.push(`create-exo-app independently versioned (v${createExoApp.version} ≠ v${version})`);
}

// 4-7. release.yml two-stage build-once workflow checks.
const workflow = readFileSync(resolve(rootDir, '.github/workflows/release.yml'), 'utf8');

const requireInWorkflow = (needle: string, label: string): void => {
  if (workflow.includes(needle)) {
    ok.push(label);
  } else {
    problems.push(`release.yml is missing: ${label} (expected to contain \`${needle}\`)`);
  }
};

// 4. PREPARE builds all three official packages exactly once (build-once).
requireInWorkflow('pnpm build', 'prepare builds core');
requireInWorkflow('pnpm --filter @codexo/exojs-particles build', 'prepare builds particles');
requireInWorkflow('pnpm --filter @codexo/exojs-tiled build', 'prepare builds tiled');

// 5. PREPARE packs/hashes/zips and uploads the artifacts.
requireInWorkflow('pnpm release:prepare', 'prepare packs tarballs + Full ZIP (release:prepare)');
requireInWorkflow('actions/upload-artifact', 'prepare uploads the release artifacts');

// 6. PUBLISH consumes the prepared artifacts and never rebuilds.
requireInWorkflow('actions/download-artifact', 'publish downloads the prepared artifacts');
requireInWorkflow('pnpm release:publish --execute', 'publish runs the build-once ordered publish (release:publish)');

// Structural: a `publish` job that `needs` the `prepare` job (artifact handoff).
const prepareJob = /\n {2}prepare:\n/.test(workflow);
const publishJob = /\n {2}publish:\n/.test(workflow);
const publishNeedsPrepare = /publish:[\s\S]*?needs:\s*prepare/.test(workflow);
if (prepareJob && publishJob && publishNeedsPrepare) {
  ok.push('two-stage pipeline: publish needs prepare');
} else {
  problems.push('release.yml must have a `prepare` job and a `publish` job where publish `needs: prepare`.');
}

// The publish job must not rebuild the runtime packages.
const publishSection = workflow.slice(workflow.indexOf('\n  publish:'));
if (/run:\s*pnpm build\b/.test(publishSection)) {
  problems.push('publish job must not run `pnpm build` — it consumes build-once artifacts.');
} else {
  ok.push('publish job does not rebuild the runtime packages');
}

// 7. Canonical publish order Core → Particles → Tiled (enforced in code).
if (PUBLISH_ORDER[0] === '@codexo/exojs' && PUBLISH_ORDER[1] === '@codexo/exojs-particles' && PUBLISH_ORDER[2] === '@codexo/exojs-tiled') {
  ok.push('PUBLISH_ORDER is Core → Particles → Tiled');
} else {
  problems.push(`PUBLISH_ORDER must be Core → Particles → Tiled, got ${PUBLISH_ORDER.join(' → ')}`);
}

// --- Report ---
if (problems.length > 0) {
  process.stderr.write('verify-release-matrix: FAILED\n');
  for (const p of problems) process.stderr.write(`  ✗ ${p}\n`);
  process.exit(1);
}

process.stdout.write(`verify-release-matrix: OK (v${version})\n`);
for (const line of ok) process.stdout.write(`  ✓ ${line}\n`);
