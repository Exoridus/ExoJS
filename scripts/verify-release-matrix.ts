/**
 * Deterministic verification of the coordinated release package matrix.
 *
 * Asserts - without publishing anything - that the release automation actually
 * handles every official package, in the right order, with coherent versions,
 * via the two-stage build-once pipeline:
 *
 *  1. Every lockstep package (`LOCKSTEP_PACKAGES`, Core + extensions) shares one
 *     lockstep version.
 *  2. Each extension's peerDependencies["@codexo/exojs"] is "<major>.<minor>.x".
 *  3. Every independent package stays off the lockstep version line.
 *  4. release.yml builds every lockstep package in the PREPARE stage.
 *  5. PREPARE runs `release:prepare` (packs the tarballs + Full ZIP) and
 *     uploads the artifacts.
 *  6. PUBLISH consumes those artifacts (`download-artifact` + `release:publish`)
 *     and never rebuilds.
 *  7. PUBLISH_ORDER equals the canonical `LOCKSTEP_PACKAGES` order (Core first),
 *     and `officialPackages()` (what `release:prepare` actually packs) covers it exactly.
 *  8. Every runtime module is a private source package that Core exports as
 *     `@codexo/exojs/<subpath>`, and is neither built nor published on its own.
 *  9. Every legacy shim keeps its module's retired name, peers on Core alone
 *     and forwards only to Core exports; `release:prepare` packs a shim only in
 *     the release that set its version.
 *
 * Read-only: safe to run in dry-run/CI. Exits non-zero on any inconsistency.
 *
 * Usage: `pnpm verify:release-matrix`
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { isShimDue } from './release/legacy-shims.ts';
import { EXTENSION_PACKAGES, INDEPENDENT_PACKAGES, LEGACY_SHIMS, LOCKSTEP_PACKAGES, RUNTIME_MODULES } from './release/lockstep-packages.ts';
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
// are already on the registry - exactly the v0.13.0 partial-publish incident.
for (const pkg of official) {
  if (pkg.repository == null) {
    problems.push(`${pkg.name}: missing "repository" field (required by \`npm publish --provenance\`).`);
  } else {
    ok.push(`${pkg.name} has a repository field (provenance-ready)`);
  }
}

// 3. Independently versioned published packages (build tooling, scaffolder).
// Each must be off the lockstep line AND out of the publish order, so the
// coordinated release neither bumps it nor publishes it by accident.
for (const independent of INDEPENDENT_PACKAGES) {
  const pkg = readPkg(`${independent.dir}/package.json`);

  if (pkg.version === version) {
    problems.push(`${pkg.name} is versioned independently (${independent.reason}), but matches the lockstep version ${version}.`);
  } else {
    ok.push(`${pkg.name} independently versioned (v${pkg.version} ≠ v${version})`);
  }

  if ((PUBLISH_ORDER as readonly string[]).includes(pkg.name)) {
    problems.push(`${pkg.name} is independently versioned and must not appear in PUBLISH_ORDER.`);
  }
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

// 4. PREPARE builds every lockstep package exactly once (build-once). The build
// line is a function of where the package lives, not of what kind of package it
// is: Core sits at the repository root and builds with `pnpm build`, every other
// lockstep package builds with `pnpm --filter <name> build` from its own
// directory. Keying this on `isExtension` read it as "not Core" and so expected
// the root build for a package that has no root build - and the check could not
// see the difference, because the Core line it looked for is a substring of
// nothing but was already present for Core.
const buildLineFor = (pkg: { readonly dir: string; readonly name: string }): string =>
  pkg.dir === '.' ? 'pnpm build' : `pnpm --filter ${pkg.name} build`;

// Looping over the SoT means a new package's build line is enforced in
// release.yml automatically.
for (const pkg of LOCKSTEP_PACKAGES) {
  const short = pkg.name.replace('@codexo/exojs-', '').replace('@codexo/exojs', 'core');
  requireInWorkflow(buildLineFor(pkg), `prepare builds ${short}`);
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

// 7. Canonical publish order = the LOCKSTEP_PACKAGES order (Core first), then
// the legacy shims, enforced in code.
const expectedOrder = [...LOCKSTEP_PACKAGES.map(p => p.name), ...LEGACY_SHIMS.map(p => p.name)];

if (PUBLISH_ORDER.length === expectedOrder.length && PUBLISH_ORDER.every((name, i) => name === expectedOrder[i])) {
  ok.push(`PUBLISH_ORDER matches LOCKSTEP_PACKAGES then LEGACY_SHIMS (${expectedOrder.join(' → ')})`);
} else {
  problems.push(`PUBLISH_ORDER must equal ${expectedOrder.join(' → ')}, got ${PUBLISH_ORDER.join(' → ')}`);
}

// 7b. What `release:prepare` actually packs (officialPackages) must be every
// lockstep package plus exactly the legacy shims this release sets, in
// PUBLISH_ORDER - a package missing here would silently never be packed, and
// therefore never published; an unchanged shim packed here would be
// republished on every Core patch.
const packed = officialPackages(rootDir);
const packedNames = packed.map(p => p.name);
const dueShims: readonly string[] = LEGACY_SHIMS.filter(shim => isShimDue(shim, readPkg(`${shim.dir}/package.json`).version, version)).map(
  shim => shim.name,
);
const expectedPacked = PUBLISH_ORDER.filter(name => LOCKSTEP_PACKAGES.some(p => p.name === name) || dueShims.includes(name));

if (packedNames.length === expectedPacked.length && packedNames.every((name, i) => name === expectedPacked[i])) {
  ok.push(`officialPackages() packs the lockstep set plus ${dueShims.length} due legacy shim(s), in PUBLISH_ORDER`);
} else {
  problems.push(`officialPackages() must pack ${expectedPacked.join(' → ')}, got ${packedNames.join(' → ')}`);
}

for (const pkg of packed) {
  const manifestName = (JSON.parse(readFileSync(resolve(pkg.dir, 'package.json'), 'utf8')) as { name: string }).name;

  if (manifestName !== pkg.name) {
    problems.push(`officialPackages() maps ${pkg.name} to a directory whose package.json is "${manifestName}" (${pkg.dir}).`);
  }
}

// 8. Runtime modules ship inside the Core tarball and nowhere else: each is a
// private source package, exported by Core under its subpath, and neither built
// nor published on its own.
const coreExports = (JSON.parse(readFileSync(resolve(rootDir, 'package.json'), 'utf8')) as { exports: Record<string, unknown> }).exports;

for (const module of RUNTIME_MODULES) {
  const manifest = JSON.parse(readFileSync(resolve(rootDir, module.dir, 'package.json'), 'utf8')) as {
    name: string;
    private?: boolean;
    exports?: unknown;
    scripts?: Record<string, string>;
  };
  const label = `runtime module ${module.subpath}`;
  const issues = [
    manifest.name === module.name ? undefined : `is named "${manifest.name}", expected "${module.name}"`,
    manifest.private === true ? undefined : 'must be private',
    manifest.exports === undefined ? undefined : 'must not declare exports of its own',
    manifest.scripts?.['build'] === undefined ? undefined : 'must not have a build script (Core builds it)',
    coreExports[`./${module.subpath}`] === undefined ? `is missing from the Core exports as "./${module.subpath}"` : undefined,
    (PUBLISH_ORDER as readonly string[]).includes(module.name) ? 'must not be in PUBLISH_ORDER' : undefined,
    // The retired name is published again, but only as the forwarder.
    (PUBLISH_ORDER as readonly string[]).includes(module.legacyName) && !LEGACY_SHIMS.some(shim => shim.name === module.legacyName)
      ? `is published as ${module.legacyName} without a legacy shim`
      : undefined,
    workflow.includes(`--filter ${module.name} build`) || workflow.includes(`--filter ${module.legacyName} build`)
      ? 'must not be built on its own in release.yml'
      : undefined,
  ].filter((issue): issue is string => issue !== undefined);

  if (issues.length === 0) {
    ok.push(`${label} ships only as @codexo/exojs/${module.subpath}`);
  } else {
    problems.push(...issues.map(issue => `${label} (${module.dir}) ${issue}`));
  }
}

// 9. Legacy shims: one per runtime module under its retired name, built by no
// workflow step, peering on Core alone, and forwarding only to Core exports.
for (const shim of LEGACY_SHIMS) {
  const module = RUNTIME_MODULES.find(candidate => candidate.subpath === shim.subpath);
  const manifest = JSON.parse(readFileSync(resolve(rootDir, shim.dir, 'package.json'), 'utf8')) as {
    name: string;
    peerDependencies?: Record<string, string>;
    scripts?: Record<string, string>;
  };
  const issues = [
    module?.legacyName === shim.name ? undefined : 'does not carry the retired name of its runtime module',
    manifest.name === shim.name ? undefined : `is named "${manifest.name}"`,
    JSON.stringify(Object.keys(manifest.peerDependencies ?? {})) === '["@codexo/exojs"]' ? undefined : 'must peer on @codexo/exojs alone',
    manifest.scripts === undefined ? undefined : 'must not have scripts',
    workflow.includes(`--filter ${shim.name} build`) ? 'must not be built in release.yml' : undefined,
    ...shim.entries.map(entry =>
      coreExports[`./${entry.target.slice('@codexo/exojs/'.length)}`] === undefined
        ? `forwards ${entry.entry} to ${entry.target}, which Core does not export`
        : undefined,
    ),
  ].filter((issue): issue is string => issue !== undefined);

  if (issues.length === 0) {
    ok.push(`legacy shim ${shim.name} forwards to ${shim.entries.map(entry => entry.target).join(', ')}`);
  } else {
    problems.push(...issues.map(issue => `legacy shim ${shim.name} (${shim.dir}) ${issue}`));
  }
}

// --- Report ---
if (problems.length > 0) {
  process.stderr.write('verify-release-matrix: FAILED\n');

  for (const p of problems) {
    process.stderr.write(`  ✗ ${p}\n`);
  }

  process.exit(1);
}

process.stdout.write(`verify-release-matrix: OK (v${version})\n`);

for (const line of ok) {
  process.stdout.write(`  ✓ ${line}\n`);
}
