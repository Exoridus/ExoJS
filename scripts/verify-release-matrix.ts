/**
 * Deterministic verification of the coordinated release package matrix.
 *
 * Asserts — without publishing anything — that the release automation actually
 * handles every official package, in the right order, with coherent versions,
 * via the two-stage build-once pipeline:
 *
 *  1. Every lockstep package (`LOCKSTEP_PACKAGES`, Core + extensions) shares one
 *     lockstep version.
 *  2. Each extension's peerDependencies["@codexo/exojs"] is "<major>.<minor>.x".
 *  3. create-exo-app is versioned independently (a different version line).
 *  4. release.yml builds every lockstep package in the PREPARE stage.
 *  5. PREPARE runs `release:prepare` (packs the tarballs + Full ZIP) and
 *     uploads the artifacts.
 *  6. PUBLISH consumes those artifacts (`download-artifact` + `release:publish`)
 *     and never rebuilds.
 *  7. PUBLISH_ORDER equals the canonical `LOCKSTEP_PACKAGES` order (Core first),
 *     and `officialPackages()` (what `release:prepare` actually packs) covers it exactly.
 *
 * Read-only: safe to run in dry-run/CI. Exits non-zero on any inconsistency.
 *
 * Usage: `pnpm verify:release-matrix`
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { EXTENSION_PACKAGES, LOCKSTEP_PACKAGES } from './release/lockstep-packages.ts';
import { PUBLISH_ORDER } from './release/manifest.ts';
import { officialPackages } from './release/prepare.ts';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');

interface Pkg {
  name: string;
  version: string;
  peer?: string;
  repository?: unknown;
}

const readPkg = (relPath: string): Pkg => {
  const raw = JSON.parse(readFileSync(resolve(rootDir, relPath), 'utf8')) as {
    name: string;
    version: string;
    peerDependencies?: Record<string, string>;
    repository?: unknown;
  };
  return { name: raw.name, version: raw.version, peer: raw.peerDependencies?.['@codexo/exojs'], repository: raw.repository };
};

const problems: string[] = [];
const ok: string[] = [];

const core = readPkg('package.json');
const createExoApp = readPkg('packages/create-exo-app/package.json');

// Every lockstep package (Core first) + the extension subset, derived from the
// single source of truth (scripts/release/lockstep-packages.ts).
const official = LOCKSTEP_PACKAGES.map(p => readPkg(p.dir === '.' ? 'package.json' : `${p.dir}/package.json`));
const extensions = EXTENSION_PACKAGES.map(p => readPkg(`${p.dir}/package.json`));

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
for (const ext of extensions) {
  if (ext.peer !== expectedPeer) {
    problems.push(`${ext.name}: peer "@codexo/exojs" is "${ext.peer ?? '(missing)'}", expected "${expectedPeer}"`);
  } else {
    ok.push(`${ext.name} peer range "${expectedPeer}"`);
  }
}

// 2b. Provenance prerequisite: `npm publish --provenance` (the release publish
// flag) refuses to build the SLSA attestation without a `repository` field.
// A missing one aborts the coordinated publish MID-RUN, after earlier packages
// are already on the registry — exactly the v0.13.0 partial-publish incident.
for (const pkg of official) {
  if (pkg.repository == null) {
    problems.push(`${pkg.name}: missing "repository" field (required by \`npm publish --provenance\`).`);
  } else {
    ok.push(`${pkg.name} has a repository field (provenance-ready)`);
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

// 4. PREPARE builds every lockstep package exactly once (build-once). Core is
// `pnpm build`; each extension is `pnpm --filter <name> build`. Looping over the
// SoT means a new package's build line is enforced in release.yml automatically.
for (const pkg of LOCKSTEP_PACKAGES) {
  const short = pkg.name.replace('@codexo/exojs-', '').replace('@codexo/exojs', 'core');
  const needle = pkg.isExtension ? `pnpm --filter ${pkg.name} build` : 'pnpm build';
  requireInWorkflow(needle, `prepare builds ${short}`);
}

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

// 7. Canonical publish order = the LOCKSTEP_PACKAGES order (Core first), enforced in code.
const expectedOrder = LOCKSTEP_PACKAGES.map(p => p.name);
if (PUBLISH_ORDER.length === expectedOrder.length && PUBLISH_ORDER.every((name, i) => name === expectedOrder[i])) {
  ok.push(`PUBLISH_ORDER matches LOCKSTEP_PACKAGES order (${expectedOrder.join(' → ')})`);
} else {
  problems.push(`PUBLISH_ORDER must equal LOCKSTEP_PACKAGES order ${expectedOrder.join(' → ')}, got ${PUBLISH_ORDER.join(' → ')}`);
}

// 7b. What `release:prepare` actually packs (officialPackages) must cover the
// canonical PUBLISH_ORDER exactly — a package missing here would silently never
// be packed, and therefore never published.
const packed = officialPackages(rootDir);
const packedNames = packed.map(p => p.name);
if (packedNames.length === PUBLISH_ORDER.length && packedNames.every((name, i) => name === PUBLISH_ORDER[i])) {
  ok.push('officialPackages() packs exactly the PUBLISH_ORDER set, in order');
} else {
  problems.push(`officialPackages() must pack ${PUBLISH_ORDER.join(' → ')}, got ${packedNames.join(' → ')}`);
}
for (const pkg of packed) {
  const manifestName = (JSON.parse(readFileSync(resolve(pkg.dir, 'package.json'), 'utf8')) as { name: string }).name;
  if (manifestName !== pkg.name) {
    problems.push(`officialPackages() maps ${pkg.name} to a directory whose package.json is "${manifestName}" (${pkg.dir}).`);
  }
}

// --- Report ---
if (problems.length > 0) {
  process.stderr.write('verify-release-matrix: FAILED\n');
  for (const p of problems) process.stderr.write(`  ✗ ${p}\n`);
  process.exit(1);
}

process.stdout.write(`verify-release-matrix: OK (v${version})\n`);
for (const line of ok) process.stdout.write(`  ✓ ${line}\n`);
