import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const NULL_SHA = '0000000000000000000000000000000000000000';

/** Existing remote branch SHA wins. A new branch validates its complete delta from the default branch. */
export const pushBase = (localSha: string, remoteSha: string, mergeBase: (head: string) => string): string => {
  if (remoteSha !== NULL_SHA) return remoteSha;
  try {
    return mergeBase(localSha).trim();
  } catch {
    return '';
  }
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [localSha, remoteSha] = process.argv.slice(2);
  if (!localSha || !remoteSha) throw new Error('Usage: node scripts/ci/push-range.ts <local-sha> <remote-sha>');
  process.stdout.write(`${pushBase(localSha, remoteSha, head => execFileSync('git', ['merge-base', head, 'origin/HEAD'], { encoding: 'utf8' }))}\n`);
}
