/**
 * Atomic release-cut: bumps all six lockstep packages, commits, and tags in one
 * step so `main` can never have a bumped-but-untagged version.
 *
 *   pnpm release:cut --version 0.15.0
 *
 * Pre-conditions (verified before any mutation):
 *   - Working tree is clean.
 *   - CHANGELOG.md has an `## [Unreleased]` section (or one already dated for
 *     the target version, for a re-cut).
 *   - No git tag vVERSION already exists.
 *   - Parity evidence for Chromium and Firefox was measured on the current HEAD
 *     (the published matrix claims the release, so it must describe it).
 *
 * What it does:
 *   1. Dates `## [Unreleased]` as `## [VERSION] - <today>`, leaving an empty
 *      `Unreleased` above it.
 *   2. Bumps `version` in all six lockstep package.json files.
 *   2. Updates every official peer range - the core and any sibling extension -
 *      to `"MAJOR.MINOR.x"` in the extension packages.
 *   3. Runs `pnpm verify:lockstep` and `pnpm verify:release-matrix` as a gate.
 *   4. Stages the six package.json files and commits.
 *   5. Creates an annotated git tag `vVERSION`.
 *
 * If the packages are already at the target version (e.g. bumped manually earlier),
 * steps 1-4 are skipped and only the tag is created.
 *
 * After this script succeeds, push both:
 *   git push && git push origin refs/tags/vVERSION
 */

import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { CHANGELOG_PATH, dateChangelogFile, hasCuttableChangelog, UNRELEASED_HEADING } from './changelog.ts';
import { LOCKSTEP_PACKAGES } from './lockstep-packages.ts';
import {
  EVIDENCE_PATH,
  type EvidenceDocument,
  GUARANTEED_BROWSERS,
  readEvidence,
  staleEvidenceReasons,
  stampRelease,
  writeEvidence,
} from './parity-evidence.ts';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

const LOCKSTEP_DIRS: { name: string; dir: string }[] = LOCKSTEP_PACKAGES.map(p => ({ name: p.name, dir: p.dir }));

// `LOCKSTEP_PACKAGES` is `as const`, so mapping its names yields a literal
// union and `Set.has` would accept only those literals - but the caller tests
// names read back from a package manifest, which are plain strings.
const EXTENSION_NAMES: ReadonlySet<string> = new Set(LOCKSTEP_PACKAGES.filter(p => p.isExtension).map(p => p.name));
const LOCKSTEP_NAMES: ReadonlySet<string> = new Set(LOCKSTEP_PACKAGES.map(p => p.name));

const log = (msg: string): void => {
  process.stdout.write(`${msg}\n`);
};
// A `never` return only ends control flow for the caller when the callee is a
// function declaration or a constant with an explicit type annotation.
type Abort = (msg: string) => never;

const die: Abort = msg => {
  process.stderr.write(`\n✗ ${msg}\n`);
  process.exit(1);
};

const parseVersionArg = (argv: string[]): string => {
  const idx = argv.indexOf('--version');
  const version = idx !== -1 ? argv[idx + 1] : undefined;
  if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
    die('Missing or invalid --version. Usage: pnpm release:cut --version 0.15.0');
  }
  return version;
};

const readPackageJson = (absDir: string): Record<string, unknown> => {
  const path = resolve(absDir, 'package.json');
  return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
};

const writePackageJson = (absDir: string, pkg: Record<string, unknown>): void => {
  const path = resolve(absDir, 'package.json');
  writeFileSync(path, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');
};

const run = (cmd: string, opts: { cwd?: string } = {}): void => {
  // `.husky/pre-commit` refuses a commit made directly on `main` or `next` -
  // correct for a human typing `git commit`, but this script's own commits
  // (the version bump, the parity claim) are the documented exception: they
  // run on `main` by design (RELEASING.md), not by mistake.
  execSync(cmd, { stdio: 'inherit', cwd: opts.cwd ?? repoRoot, env: { ...process.env, ALLOW_MAIN_COMMIT: '1' } });
};

// ── Pre-flight checks ──────────────────────────────────────────────────────

const assertCleanTree = (): void => {
  try {
    execSync('git diff-index --quiet HEAD --', { stdio: 'pipe', cwd: repoRoot });
  } catch {
    die('Working tree is dirty. Commit or stash changes before cutting a release.');
  }
};

const assertChangelogSection = (version: string): void => {
  const changelog = readFileSync(resolve(repoRoot, CHANGELOG_PATH), 'utf8');

  if (hasCuttableChangelog(changelog, version)) {
    return;
  }

  die(
    `CHANGELOG.md has neither an "${UNRELEASED_HEADING}" section nor a dated one for [${version}].
` + `Collect the release notes under "${UNRELEASED_HEADING}"; this script dates them.`,
  );
};

const assertTagAbsent = (version: string): void => {
  const tag = `v${version}`;
  try {
    execSync(`git rev-parse --verify refs/tags/${tag}`, { stdio: 'pipe', cwd: repoRoot });
    die(`Tag ${tag} already exists. Delete it first if you need to re-cut.`);
  } catch {
    // tag absent - good
  }
};

/**
 * The commit `staleEvidenceReasons` checks the evidence against.
 *
 * The measurement stamps the HEAD it ran against, then the result is
 * committed - which moves HEAD one commit past whatever it recorded. Literal
 * HEAD would therefore reject every evidence commit ever made, including a
 * correct one: walk back over commits that touch only `EVIDENCE_PATH`, since
 * those carry no source change and cannot invalidate a measurement of their
 * own parent.
 */
const resolveEvidenceHead = (): string => {
  let head = execSync('git rev-parse --short HEAD', { encoding: 'utf8', cwd: repoRoot }).trim();

  for (;;) {
    let parent: string;

    try {
      // `~1` rather than `^`: on Windows, execSync's default shell is cmd.exe,
      // which treats a trailing `^` as its own escape character and strips it
      // before git ever sees the argument.
      parent = execSync(`git rev-parse --short ${head}~1`, { encoding: 'utf8', cwd: repoRoot }).trim();
    } catch {
      return head;
    }

    const changed = execSync(`git diff --name-only ${parent} ${head}`, { encoding: 'utf8', cwd: repoRoot }).trim().split('\n').filter(Boolean);

    if (changed.length !== 1 || changed[0] !== EVIDENCE_PATH) {
      return head;
    }

    head = parent;
  }
};

/**
 * The published parity matrix must describe the commit being released - it is
 * linked from the deployment and troubleshooting guides, and the release states
 * it holds as of this version.
 *
 * Compared against the resolved evidence head as it stands right now, before
 * this script creates its own bump commit, because that is the tree the
 * measurement ran against.
 *
 * Deliberately not a CI browser lane: the run is bound to the moment the claim
 * gets published, not to every push.
 */
const assertEvidenceFresh = (doc: EvidenceDocument): void => {
  const head = resolveEvidenceHead();
  const stale = staleEvidenceReasons(doc, head);

  if (stale.length > 0) {
    die(
      `Parity evidence is not current for HEAD (${head}):\n` +
        stale.map(line => `  - ${line}`).join('\n') +
        `\n\nThe matrix is published from ${EVIDENCE_PATH} and the release claims it holds as of this version.\n` +
        `Re-measure, commit the result, then re-run release:cut:\n` +
        `  pnpm test:parity\n` +
        `  pnpm test:parity:firefox`,
    );
  }
};

// ── Bump ───────────────────────────────────────────────────────────────────

const bumpPackages = (version: string): boolean => {
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
      // Every official peer, not only the core one: an extension that depends
      // on a sibling (tiled and ldtk on tilemap, tilemap-physics on both)
      // would otherwise ship a range a minor behind, which no install of the
      // published package can satisfy.
      const peer = pkg['peerDependencies'] as Record<string, string> | undefined;

      for (const dep of Object.keys(peer ?? {})) {
        if (peer && LOCKSTEP_NAMES.has(dep) && peer[dep] !== peerRange) {
          peer[dep] = peerRange;
          changed = true;
        }
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
};

// ── Main ───────────────────────────────────────────────────────────────────

const version = parseVersionArg(process.argv.slice(2));
const tag = `v${version}`;

log(`\n→ release:cut ${tag}`);
log('');

log('  checking pre-conditions…');
assertCleanTree();
assertChangelogSection(version);
assertTagAbsent(version);

const evidence = readEvidence(repoRoot);

assertEvidenceFresh(evidence);
log(`  ✓ tree clean, changelog section present, tag absent, parity evidence current (${GUARANTEED_BROWSERS.join(' + ')})`);

log('\n→ dating the changelog section…');

const datedChangelog = dateChangelogFile(resolve(repoRoot, CHANGELOG_PATH), version);

log(datedChangelog ? `  ✓ [Unreleased] is now [${version}]` : `  ✓ already dated for ${version}`);

log('\n→ stamping the release onto the parity evidence…');
writeEvidence(repoRoot, stampRelease(evidence, version));
log(`  ✓ ${EVIDENCE_PATH} now claims ${version}`);

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
  run(`git add ${packageJsonPaths} ${EVIDENCE_PATH} ${CHANGELOG_PATH}`);
  run(`git commit -m "chore(release): bump to ${version}"`);
  log(`  ✓ committed`);
} else {
  // The evidence stamp above already dirtied the tree, so it still needs a
  // commit of its own - otherwise the tag would point at a tree whose matrix
  // does not name the release it is published under.
  log('  all packages already at target version — committing the evidence stamp only');
  run(`git add ${EVIDENCE_PATH} ${CHANGELOG_PATH}`);
  run(`git commit -m "chore(release): claim parity for ${version}"`);
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
