import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const NULL_SHA = '0000000000000000000000000000000000000000';

/** Existing remote branch SHA wins. A new branch validates its complete delta from the nearest integration branch. */
export const pushBase = (localSha: string, remoteSha: string, mergeBase: (head: string) => string): string => {
  if (remoteSha !== NULL_SHA) {
    return remoteSha;
  }

  try {
    return mergeBase(localSha).trim();
  } catch {
    return '';
  }
};

/** Integration branches a pull request may target, closest-wins; `origin/HEAD` is the default branch. */
export const BASE_REFS = ['origin/next', 'origin/HEAD'] as const;

/**
 * The merge base with the nearest of `refs`. Pull requests target `next`, which
 * runs well ahead of the default branch, so a base taken from the default branch
 * alone would count every commit `next` carries as part of the pushed change.
 * A ref that does not exist is skipped; none existing throws, which the caller
 * turns into the unknown (full) validation range.
 */
export const nearestMergeBase = (head: string, refs: readonly string[], git: (...args: string[]) => string): string => {
  let best: { sha: string; distance: number } | undefined;

  for (const ref of refs) {
    try {
      const sha = git('merge-base', head, ref).trim();
      const distance = Number(git('rev-list', '--count', `${sha}..${head}`).trim());

      if (sha !== '' && Number.isFinite(distance) && (!best || distance < best.distance)) {
        best = { sha, distance };
      }
    } catch {
      /* A missing ref cannot narrow the range. */
    }
  }

  if (!best) {
    throw new Error(`No merge base with ${refs.join(' or ')}`);
  }

  return best.sha;
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [localSha, remoteSha] = process.argv.slice(2);

  if (!localSha || !remoteSha) {
    throw new Error('Usage: node scripts/ci/push-range.ts <local-sha> <remote-sha>');
  }

  const git = (...args: string[]): string => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });

  process.stdout.write(`${pushBase(localSha, remoteSha, head => nearestMergeBase(head, BASE_REFS, git))}\n`);
}
