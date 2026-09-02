/**
 * Verifies that all official ExoJS lockstep packages share the same version.
 *
 * The lockstep version contract: every package in `LOCKSTEP_PACKAGES`
 * (`scripts/release/lockstep-packages.ts`) - Core plus each opt-in extension -
 * must be on the same X.Y.Z version per release, and every peer range one of
 * them declares on another - the core or a sibling extension - must be
 * `<major>.<minor>.x`. A sibling peer left a minor behind resolves to nothing
 * once the line moves, which no install of the shipped package can satisfy.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { EXTENSION_PACKAGES } from './release/lockstep-packages.ts';

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
    `\nAll ${packages.length} packages must be on the same version before release.\n` + 'Update every package.json file to the same version.\n',
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

process.stdout.write(`verify-lockstep: all ${packages.length} packages at v${versions[0]}; every official peer range = "${expectedPeer}" ✓\n`);
