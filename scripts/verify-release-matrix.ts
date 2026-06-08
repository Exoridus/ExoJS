/**
 * Deterministic verification of the coordinated release package matrix.
 *
 * Asserts — without publishing anything — that the release automation actually
 * handles every official package, in the right order, with coherent versions:
 *
 *  1. The three official packages (@codexo/exojs, -particles, -tiled) share one
 *     lockstep version.
 *  2. Each extension's peerDependencies["@codexo/exojs"] is "<major>.<minor>.x".
 *  3. create-exo-app is versioned independently (a different version line).
 *  4. .github/workflows/release.yml builds all three packages before publishing.
 *  5. release.yml publishes all three in order: Core → Particles → Tiled.
 *  6. The full-release bundle step packs all three tarballs.
 *
 * Read-only: safe to run in dry-run/CI. Exits non-zero on any inconsistency.
 *
 * Usage: `pnpm verify:release-matrix`
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

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

// 4-6. release.yml workflow checks.
const workflow = readFileSync(resolve(rootDir, '.github/workflows/release.yml'), 'utf8');

const requireInWorkflow = (needle: string, label: string): void => {
  if (workflow.includes(needle)) {
    ok.push(label);
  } else {
    problems.push(`release.yml is missing: ${label} (expected to contain \`${needle}\`)`);
  }
};

// Builds extension packages before publishing.
requireInWorkflow('pnpm --filter @codexo/exojs-particles build', 'release.yml builds particles');
requireInWorkflow('pnpm --filter @codexo/exojs-tiled build', 'release.yml builds tiled');

// Publishes each official package.
const indexCore = workflow.indexOf('Publish @codexo/exojs to npm');
const indexParticles = workflow.indexOf('Publish @codexo/exojs-particles to npm');
const indexTiled = workflow.indexOf('Publish @codexo/exojs-tiled to npm');

if (indexCore === -1) problems.push('release.yml missing publish step for @codexo/exojs.');
if (indexParticles === -1) problems.push('release.yml missing publish step for @codexo/exojs-particles.');
if (indexTiled === -1) problems.push('release.yml missing publish step for @codexo/exojs-tiled.');

// 5. Publish order: Core → Particles → Tiled.
if (indexCore !== -1 && indexParticles !== -1 && indexTiled !== -1) {
  if (indexCore < indexParticles && indexParticles < indexTiled) {
    ok.push('publish order Core → Particles → Tiled');
  } else {
    problems.push('release.yml publish order is not Core → Particles → Tiled.');
  }
}

// 6. Full bundle packs all three tarballs.
requireInWorkflow('npm pack --pack-destination "${BUNDLE_DIR}/npm"', 'release.yml packs core tarball into bundle');
requireInWorkflow('cd packages/exojs-particles && npm pack', 'release.yml packs particles tarball into bundle');
requireInWorkflow('cd packages/exojs-tiled && npm pack', 'release.yml packs tiled tarball into bundle');

// --- Report ---
if (problems.length > 0) {
  process.stderr.write('verify-release-matrix: FAILED\n');
  for (const p of problems) process.stderr.write(`  ✗ ${p}\n`);
  process.exit(1);
}

process.stdout.write(`verify-release-matrix: OK (v${version})\n`);
for (const line of ok) process.stdout.write(`  ✓ ${line}\n`);
