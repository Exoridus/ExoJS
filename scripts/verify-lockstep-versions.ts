/**
 * Verifies that all three official ExoJS packages share the same version.
 *
 * The lockstep version contract: @codexo/exojs, @codexo/exojs-particles,
 * and @codexo/exojs-tiled must all be on the same X.Y.Z version for every
 * coordinated release.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');

interface PackageInfo {
  name: string;
  version: string;
  peer?: string;
}

function readPackage(relPath: string): PackageInfo {
  const pkg = JSON.parse(readFileSync(resolve(rootDir, relPath), 'utf8')) as {
    name: string;
    version: string;
    peerDependencies?: Record<string, string>;
  };
  return { name: pkg.name, version: pkg.version, peer: pkg.peerDependencies?.['@codexo/exojs'] };
}

const corePkg = readPackage('package.json');
const extensionPkgs = [readPackage('packages/exojs-particles/package.json'), readPackage('packages/exojs-tiled/package.json')];
const packages = [corePkg, ...extensionPkgs];

const versions = [...new Set(packages.map(p => p.version))];

if (versions.length !== 1) {
  process.stderr.write('verify-lockstep: VERSION MISMATCH across official packages:\n');
  for (const p of packages) {
    process.stderr.write(`  ${p.name}: ${p.version}\n`);
  }
  process.stderr.write('\nAll three packages must be on the same version before release.\n' + 'Update all three package.json files to the same version.\n');
  process.exit(1);
}

// Each extension's peer range on the core must cover the lockstep version.
// The contract is `<major>.<minor>.x` so a coordinated minor/patch ships coherently.
const [major, minor] = versions[0].split('.');
const expectedPeer = `${major}.${minor}.x`;
const peerProblems: string[] = [];

for (const pkg of extensionPkgs) {
  if (pkg.peer === undefined) {
    peerProblems.push(`  ${pkg.name}: missing peerDependencies["@codexo/exojs"]`);
  } else if (pkg.peer !== expectedPeer) {
    peerProblems.push(`  ${pkg.name}: peer "@codexo/exojs" is "${pkg.peer}", expected "${expectedPeer}"`);
  }
}

if (peerProblems.length > 0) {
  process.stderr.write('verify-lockstep: PEER RANGE MISMATCH:\n');
  process.stderr.write(`${peerProblems.join('\n')}\n`);
  process.stderr.write(`\nEach extension's peerDependencies["@codexo/exojs"] must be "${expectedPeer}" for v${versions[0]}.\n`);
  process.exit(1);
}

process.stdout.write(`verify-lockstep: all 3 packages at v${versions[0]}; extension peer ranges = "${expectedPeer}" ✓\n`);
