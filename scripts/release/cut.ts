/**
 * Atomic release-cut: bumps all six lockstep packages, commits, and tags in one
 * step so `main` can never have a bumped-but-untagged version.
 *
 *   pnpm release:cut --version 0.15.0
 *
 * Pre-conditions (verified before any mutation):
 *   - Working tree is clean.
 *   - CHANGELOG.md has a `## [VERSION] - YYYY-MM-DD` section for the target version.
 *   - No git tag vVERSION already exists.
 *
 * What it does:
 *   1. Bumps `version` in all six lockstep package.json files.
 *   2. Updates `peerDependencies["@codexo/exojs"]` to `"MAJOR.MINOR.x"` in the
 *      five extension packages.
 *   3. Runs `pnpm verify:lockstep` and `pnpm verify:release-matrix` as a gate.
 *   4. Stages the six package.json files and commits.
 *   5. Creates an annotated git tag `vVERSION`.
 *
 * If the packages are already at the target version (e.g. bumped manually earlier),
 * steps 1–4 are skipped and only the tag is created.
 *
 * After this script succeeds, push both:
 *   git push && git push origin refs/tags/vVERSION
 */

import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

const LOCKSTEP_DIRS: Array<{ name: string; dir: string }> = [
  { name: '@codexo/exojs', dir: '.' },
  { name: '@codexo/exojs-particles', dir: 'packages/exojs-particles' },
  { name: '@codexo/exojs-tilemap', dir: 'packages/exojs-tilemap' },
  { name: '@codexo/exojs-tiled', dir: 'packages/exojs-tiled' },
  { name: '@codexo/exojs-physics', dir: 'packages/exojs-physics' },
  { name: '@codexo/exojs-audio-fx', dir: 'packages/exojs-audio-fx' },
];

const EXTENSION_NAMES = new Set([
  '@codexo/exojs-particles',
  '@codexo/exojs-tilemap',
  '@codexo/exojs-tiled',
  '@codexo/exojs-physics',
  '@codexo/exojs-audio-fx',
]);

const log = (msg: string): void => process.stdout.write(`${msg}\n`);
const die = (msg: string): never => {
  process.stderr.write(`\n✗ ${msg}\n`);
  process.exit(1);
};

function parseVersionArg(argv: string[]): string {
  const idx = argv.indexOf('--version');
  const version = idx !== -1 ? argv[idx + 1] : undefined;
  if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
    die('Missing or invalid --version. Usage: pnpm release:cut --version 0.15.0');
  }
  return version;
}

function readPackageJson(absDir: string): Record<string, unknown> {
  const path = resolve(absDir, 'package.json');
  return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
}

function writePackageJson(absDir: string, pkg: Record<string, unknown>): void {
  const path = resolve(absDir, 'package.json');
  writeFileSync(path, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');
}

function run(cmd: string, opts: { cwd?: string } = {}): void {
  execSync(cmd, { stdio: 'inherit', cwd: opts.cwd ?? repoRoot });
}

function runCapture(cmd: string): string {
  return execSync(cmd, { cwd: repoRoot, encoding: 'utf8' }).trim();
}

// ── Pre-flight checks ──────────────────────────────────────────────────────

function assertCleanTree(): void {
  const dirty = runCapture('git diff-index --quiet HEAD -- ; echo $?');
  if (dirty !== '0') {
    die('Working tree is dirty. Commit or stash changes before cutting a release.');
  }
}

function assertChangelogSection(version: string): void {
  const changelog = readFileSync(resolve(repoRoot, 'CHANGELOG.md'), 'utf8');
  const pattern = new RegExp(`^## \\[${version.replace('.', '\\.').replace('.', '\\.')}\\] - \\d{4}-\\d{2}-\\d{2}`, 'm');
  if (!pattern.test(changelog)) {
    die(
      `CHANGELOG.md does not have a dated section for [${version}].\n` +
      `Add "## [${version}] - YYYY-MM-DD" with release notes before cutting.`,
    );
  }
}

function assertTagAbsent(version: string): void {
  const tag = `v${version}`;
  try {
    execSync(`git rev-parse --verify refs/tags/${tag}`, { stdio: 'pipe', cwd: repoRoot });
    die(`Tag ${tag} already exists. Delete it first if you need to re-cut.`);
  } catch {
    // tag absent — good
  }
}

// ── Bump ───────────────────────────────────────────────────────────────────

function bumpPackages(version: string): boolean {
  const peerRange = `${version.split('.').slice(0, 2).join('.')}.x`;
  let anyChanged = false;

  for (const { name, dir } of LOCKSTEP_DIRS) {
    const absDir = resolve(repoRoot, dir);
    const pkg = readPackageJson(absDir);

    let changed = false;

    if (pkg['version'] !== version) {
      pkg['version'] = version;
      changed = true;
    }

    if (EXTENSION_NAMES.has(name)) {
      const peer = pkg['peerDependencies'] as Record<string, string> | undefined;
      if (peer && peer['@codexo/exojs'] !== peerRange) {
        peer['@codexo/exojs'] = peerRange;
        changed = true;
      }
    }

    if (changed) {
      writePackageJson(absDir, pkg);
      log(`  bumped ${name} → ${version}`);
      anyChanged = true;
    } else {
      log(`  ${name} already at ${version} (skipped)`);
    }
  }

  return anyChanged;
}

// ── Main ───────────────────────────────────────────────────────────────────

const version = parseVersionArg(process.argv.slice(2));
const tag = `v${version}`;

log(`\n→ release:cut ${tag}`);
log('');

log('  checking pre-conditions…');
assertCleanTree();
assertChangelogSection(version);
assertTagAbsent(version);
log('  ✓ tree clean, changelog section present, tag absent');

log('\n→ bumping lockstep packages…');
const bumped = bumpPackages(version);

if (bumped) {
  log('\n→ verifying lockstep + release-matrix…');
  try {
    run('pnpm verify:lockstep');
    run('pnpm verify:release-matrix');
  } catch {
    die('Verification failed after bump. Fix the errors and re-run release:cut.');
  }

  log('\n→ committing version bump…');
  const packageJsonPaths = LOCKSTEP_DIRS.map(({ dir }) => resolve(dir, 'package.json')).join(' ');
  run(`git add ${packageJsonPaths}`);
  run(`git commit -m "chore(release): bump to ${version}"`);
  log(`  ✓ committed`);
} else {
  log('  all packages already at target version — skipping commit');
}

log(`\n→ creating annotated tag ${tag}…`);
run(`git tag -a ${tag} -m "ExoJS ${tag}"`);
log(`  ✓ tag created`);

log(`
✓ release:cut complete.

Next steps:
  1. git push && git push origin refs/tags/${tag}
  2. Watch the Release CI workflow on GitHub.
  3. Verify: npm view @codexo/exojs version  (should show ${version})
`);

function dirname(path: string): string {
  return path.replace(/[\\/][^\\/]*$/, '');
}
