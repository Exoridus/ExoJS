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

function readVersion(relPath: string): { name: string; version: string } {
  const pkg = JSON.parse(readFileSync(resolve(rootDir, relPath), 'utf8')) as {
    name: string;
    version: string;
  };
  return { name: pkg.name, version: pkg.version };
}

const packages = [readVersion('package.json'), readVersion('packages/exojs-particles/package.json'), readVersion('packages/exojs-tiled/package.json')];

const versions = [...new Set(packages.map(p => p.version))];

if (versions.length !== 1) {
  process.stderr.write('verify-lockstep: VERSION MISMATCH across official packages:\n');
  for (const p of packages) {
    process.stderr.write(`  ${p.name}: ${p.version}\n`);
  }
  process.stderr.write('\nAll three packages must be on the same version before release.\n' + 'Update all three package.json files to the same version.\n');
  process.exit(1);
}

process.stdout.write(`verify-lockstep: all 3 packages at v${versions[0]} ✓\n`);
