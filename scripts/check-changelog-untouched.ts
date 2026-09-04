/**
 * Keep CHANGELOG.md out of pull requests.
 *
 * The `Unreleased` section is assembled at the release cut from the squash
 * commits (see `release/changelogFromCommits.ts`); a pull request that edits
 * the file by hand reintroduces the merge conflict every second pull request
 * used to hit at the top of the same section. Release commits are exempt, as
 * is a branch that has no base to compare against.
 */

import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const git = (...args: string[]): string => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();

if (process.env['EXOJS_ALLOW_CHANGELOG_EDIT'] === '1') {
  console.log('check-changelog-untouched: skipped (EXOJS_ALLOW_CHANGELOG_EDIT=1).');
  process.exit(0);
}

let base: string;

try {
  base = git('merge-base', 'HEAD', 'origin/next');
} catch {
  console.log('check-changelog-untouched: no origin/next to compare against; skipped.');
  process.exit(0);
}

const subject = git('log', '-1', '--format=%s');

if (/^chore\(release\)/u.test(subject)) {
  console.log('check-changelog-untouched: release commit; skipped.');
  process.exit(0);
}

const changed = git('diff', '--name-only', base, 'HEAD', '--', 'CHANGELOG.md');

if (changed.length === 0) {
  console.log('check-changelog-untouched: CHANGELOG.md untouched.');
  process.exit(0);
}

console.error(
  'check-changelog-untouched: this branch edits CHANGELOG.md.\n\n' +
    'The Unreleased section is generated at the release cut from the squash commits, so the pull request\n' +
    'description is the release text. Revert the CHANGELOG.md change and put the wording into the PR body.\n' +
    'A release commit (chore(release): ...) is exempt; EXOJS_ALLOW_CHANGELOG_EDIT=1 bypasses the check.',
);
process.exit(1);
