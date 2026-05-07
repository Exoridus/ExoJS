#!/usr/bin/env node
/**
 * Safe release flow for ExoJS.
 *
 * Atomic pre-flight: runs every check CI's `verify` job runs locally, then
 * creates the annotated tag for the current `package.json` version. The
 * actual push is left manual so the user reviews the diff one last time.
 *
 *  1. Working tree is clean.
 *  2. Active branch is `main`.
 *  3. Local `main` is up to date with `origin/main`.
 *  4. The `vX.Y.Z` tag for `package.json#version` does not already exist.
 *  5. `npm run verify:release` (typecheck + lint + test + verify:package)
 *     passes.
 *  6. Annotated tag is created at HEAD.
 *  7. The next-step push instructions are printed; the script exits.
 *
 * Aborts on any failure. Idempotent — safe to re-run after fixing issues
 * (the failed run never reaches the tag-creation step). To undo a created
 * tag before pushing: `git tag -d vX.Y.Z`.
 *
 * Usage: `npm run release`
 */
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const sh = (cmd) => execSync(cmd, { stdio: 'inherit' });
const out = (cmd) => execSync(cmd, { encoding: 'utf8' }).trim();
const fail = (msg) => {
    process.stderr.write(`\n  ✗ ${msg}\n\n`);
    process.exit(1);
};
const step = (msg) => process.stdout.write(`\n→ ${msg}\n`);

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const tag = `v${pkg.version}`;

step(`Preparing release ${tag}`);

// 1. Working tree clean.
const dirty = out('git status --porcelain');

if (dirty) {
    fail(`Working tree is dirty:\n${dirty}\n  Commit or stash changes first.`);
}

// 2. On main.
const branch = out('git rev-parse --abbrev-ref HEAD');

if (branch !== 'main') {
    fail(`Not on main (current: ${branch}). Releases must originate from main.`);
}

// 3. Up to date with origin/main.
step('Fetching origin/main');
sh('git fetch origin main --quiet');

const local = out('git rev-parse HEAD');
const remote = out('git rev-parse origin/main');

if (local !== remote) {
    const base = out('git merge-base HEAD origin/main');

    if (base !== remote) {
        fail('main is not up to date with origin/main. Pull or rebase first.');
    }
}

// 4. Tag does not already exist (locally OR on origin).
let localTagExists = false;

try {
    out(`git rev-parse ${tag}`);
    localTagExists = true;
} catch {
    // tag does not exist locally — expected
}

if (localTagExists) {
    fail(`Tag ${tag} already exists locally. Bump the version in package.json first, or run "git tag -d ${tag}" to remove it.`);
}

const remoteTag = out(`git ls-remote --tags origin ${tag}`);

if (remoteTag) {
    fail(`Tag ${tag} already exists on origin. Bump the version in package.json first.`);
}

// 5. Run verify:release (full CI-equivalent suite).
step(`Running verify:release (this mirrors CI's verify job)`);

try {
    sh('npm run verify:release');
} catch {
    fail('verify:release failed. Fix the issues above and re-run.');
}

// 6. Create annotated tag at HEAD.
step(`Tagging ${tag} at ${local.slice(0, 7)}`);
sh(`git tag -a ${tag} -m "${tag}"`);

// 7. Next steps.
process.stdout.write(`\n✓ ${tag} tagged locally at ${local.slice(0, 7)}.\n\n`);
process.stdout.write('Push to publish:\n');
process.stdout.write('  git push origin main\n');
process.stdout.write(`  git push origin ${tag}\n\n`);
process.stdout.write('The tag push triggers the release workflow on GitHub Actions, which\n');
process.stdout.write('re-runs the verify suite and publishes to npm via Trusted Publisher.\n\n');
process.stdout.write(`To undo before pushing:  git tag -d ${tag}\n\n`);
