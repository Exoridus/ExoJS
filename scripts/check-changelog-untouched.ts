/**
 * Keep CHANGELOG.md out of pull requests.
 *
 * The `Unreleased` section is assembled at the release cut from the squash
 * commits (see `release/changelogFromCommits.ts`); a pull request that edits
 * the file by hand reintroduces the merge conflict every second pull request
 * used to hit at the top of the same section. Release commits are exempt, as
 * is a branch that has no base to compare against.
 *
 * The comparison base follows the line the work is destined for. On `main`
 * every release merge legitimately carries a rewritten CHANGELOG, so comparing
 * that branch against `next` reports every later commit - a gate fix pushed
 * after a version bump - as a hand edit of a file it never touched.
 */

import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/** Runs a git command and returns its trimmed output, or throws when the command fails. */
export type GitRunner = (...args: string[]) => string;

export interface ChangelogCheckInput {
  readonly git: GitRunner;
  /** The branch being checked, which decides the comparison base. */
  readonly branch: string;
}

export interface ChangelogCheckResult {
  readonly ok: boolean;
  /** Why the check passed or failed, for the console. */
  readonly reason: string;
}

/** The line a branch is destined for, which is what its CHANGELOG is compared against. */
export const upstreamFor = (branch: string): string => (branch === 'main' ? 'origin/main' : 'origin/next');

/**
 * Whether `HEAD` leaves CHANGELOG.md as its base has it.
 *
 * Pure apart from the injected `git`, so the scenarios that matter - a feature
 * branch, a release commit, a commit on `main` after a bump - are testable
 * without a checkout.
 */
export const checkChangelogUntouched = ({ git, branch }: ChangelogCheckInput): ChangelogCheckResult => {
  const upstream = upstreamFor(branch);

  let base: string;

  try {
    base = git('merge-base', 'HEAD', upstream);
  } catch {
    return { ok: true, reason: `no ${upstream} to compare against; skipped.` };
  }

  if (/^chore\(release\)/u.test(git('log', '-1', '--format=%s'))) {
    return { ok: true, reason: 'release commit; skipped.' };
  }

  if (git('diff', '--name-only', base, 'HEAD', '--', 'CHANGELOG.md').length === 0) {
    return { ok: true, reason: 'CHANGELOG.md untouched.' };
  }

  return { ok: false, reason: `this branch edits CHANGELOG.md (compared against ${upstream}).` };
};

const runGit: GitRunner = (...args: string[]) =>
  execFileSync('git', args, { cwd: resolve(import.meta.dirname, '..'), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();

/** The branch being checked: CI states it outright, a local run reads it from the checkout. */
const currentBranch = (git: GitRunner): string => {
  const fromCi = process.env['GITHUB_REF_NAME'];

  if (fromCi !== undefined && fromCi !== '') {
    return fromCi;
  }

  try {
    return git('rev-parse', '--abbrev-ref', 'HEAD');
  } catch {
    return '';
  }
};

const main = (): void => {
  if (process.env['EXOJS_ALLOW_CHANGELOG_EDIT'] === '1') {
    console.log('check-changelog-untouched: skipped (EXOJS_ALLOW_CHANGELOG_EDIT=1).');
    return;
  }

  const result = checkChangelogUntouched({ git: runGit, branch: currentBranch(runGit) });

  if (result.ok) {
    console.log(`check-changelog-untouched: ${result.reason}`);
    return;
  }

  console.error(
    `check-changelog-untouched: ${result.reason}\n\n` +
      'The Unreleased section is generated at the release cut from the squash commits, so the pull request\n' +
      'description is the release text. Revert the CHANGELOG.md change and put the wording into the PR body.\n' +
      'A release commit (chore(release): ...) is exempt; EXOJS_ALLOW_CHANGELOG_EDIT=1 bypasses the check.',
  );
  process.exit(1);
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
