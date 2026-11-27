/**
 * Verifies that all official ExoJS lockstep packages share the same version.
 *
 * The lockstep version contract: every package in `LOCKSTEP_PACKAGES`
 * (`scripts/release/lockstep-packages.ts`) - Core plus each opt-in extension -
 * must be on the same X.Y.Z version per release, and every peer range one of
 * them declares on another - the core or a sibling extension - must be
 * `<major>.<minor>.x`. A sibling peer left a minor behind resolves to nothing
 * once the line moves, which no install of the shipped package can satisfy.
 *
 * The legacy shims are off the per-release version but not off the line: each
 * sits on the lockstep line until that line moves past the one it serves, is
 * never ahead of Core, and peers on `<major>.<minor>.x` of its own version.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { lineOf, shimPeerRange } from './release/legacy-shims.ts';
import { EXTENSION_PACKAGES, LEGACY_SHIMS } from './release/lockstep-packages.ts';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');

interface PackageInfo {
  name: string;
  version: string;
  /** Every `@codexo/*` peer range the package declares, by package name. */
  peers: Record<string, string>;
}

const readPackage = (relPath: string): PackageInfo => {
  const pkg = JSON.parse(readFileSync(resolve(rootDir, relPath), 'utf8')) as {
    name: string;
    version: string;
    peerDependencies?: Record<string, string>;
  };
  const peers = Object.entries(pkg.peerDependencies ?? {}).filter(([dep]) => dep.startsWith('@codexo/'));

  return { name: pkg.name, version: pkg.version, peers: Object.fromEntries(peers) };
};

const corePkg = readPackage('package.json');
const extensionPkgs = EXTENSION_PACKAGES.map(p => readPackage(`${p.dir}/package.json`));
const packages = [corePkg, ...extensionPkgs];

const versions = [...new Set(packages.map(p => p.version))];

if (versions.length !== 1) {
  process.stderr.write('verify-lockstep: VERSION MISMATCH across official packages:\n');

  for (const p of packages) {
    process.stderr.write(`  ${p.name}: ${p.version}\n`);
  }

  process.stderr.write(
    `\nAll ${packages.length} packages must be on the same version before release.\n` +
      'Update every package.json file to the same version.\n',
  );
  process.exit(1);
}

// Every peer range an official package declares on another must cover the
// lockstep version. The contract is `<major>.<minor>.x` so a coordinated
// minor/patch ships coherently.
const [major, minor] = versions[0].split('.');
const expectedPeer = `${major}.${minor}.x`;
const peerProblems: string[] = [];

for (const pkg of extensionPkgs) {
  if (pkg.peers['@codexo/exojs'] === undefined) {
    peerProblems.push(`  ${pkg.name}: missing peerDependencies["@codexo/exojs"]`);
  }

  for (const [dep, range] of Object.entries(pkg.peers)) {
    if (range !== expectedPeer) {
      peerProblems.push(`  ${pkg.name}: peer "${dep}" is "${range}", expected "${expectedPeer}"`);
    }
  }
}

if (peerProblems.length > 0) {
  process.stderr.write('verify-lockstep: PEER RANGE MISMATCH:\n');
  process.stderr.write(`${peerProblems.join('\n')}\n`);
  process.stderr.write(`\nEvery peer range an official package declares on another must be "${expectedPeer}" for v${versions[0]}.\n`);
  process.exit(1);
}

const compareVersions = (a: string, b: string): number => {
  const left = a.split('.').map(Number);
  const right = b.split('.').map(Number);

  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const difference = (left[i] ?? 0) - (right[i] ?? 0);

    if (difference !== 0) {
      return difference;
    }
  }

  return 0;
};

const shimProblems: string[] = [];
const coreLine = lineOf(corePkg.version);

for (const shim of LEGACY_SHIMS) {
  const pkg = readPackage(`${shim.dir}/package.json`);
  const expectedLine = compareVersions(coreLine, shim.line) <= 0 ? coreLine : shim.line;

  if (lineOf(pkg.version) !== expectedLine) {
    shimProblems.push(`  ${pkg.name}: v${pkg.version} is not on the ${expectedLine} line`);
  }

  if (compareVersions(pkg.version, corePkg.version) > 0) {
    shimProblems.push(`  ${pkg.name}: v${pkg.version} is ahead of Core v${corePkg.version}`);
  }

  if (JSON.stringify(pkg.peers) !== JSON.stringify({ '@codexo/exojs': shimPeerRange(pkg.version) })) {
    shimProblems.push(`  ${pkg.name}: peers ${JSON.stringify(pkg.peers)}, expected only "@codexo/exojs": "${shimPeerRange(pkg.version)}"`);
  }
}

if (shimProblems.length > 0) {
  process.stderr.write('verify-lockstep: LEGACY SHIM VERSION MISMATCH:\n');
  process.stderr.write(`${shimProblems.join('\n')}\n`);
  process.exit(1);
}

process.stdout.write(
  `verify-lockstep: all ${packages.length} packages at v${versions[0]}; every official peer range = "${expectedPeer}"; ${LEGACY_SHIMS.length} legacy shims on their line ✓\n`,
);
