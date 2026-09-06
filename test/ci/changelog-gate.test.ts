import { describe, expect, it } from 'vitest';

import { checkChangelogUntouched, type GitRunner, upstreamFor } from '../../scripts/check-changelog-untouched';

/**
 * The CHANGELOG gate against the two lines it has to tell apart.
 *
 * A feature branch is compared against `next`, where a hand-edited CHANGELOG is
 * the conflict the gate exists to prevent. `main` is compared against itself,
 * because every release merge rewrites the file there and comparing that branch
 * against `next` reported each later commit - a gate fix pushed after a bump -
 * as an edit of a file it never touched.
 */

interface FakeRepo {
  /** Refs `merge-base` can resolve; anything else throws, as git does. */
  readonly knownUpstreams?: readonly string[];
  readonly subject?: string;
  /** Paths the diff against the resolved base reports, per upstream. */
  readonly changedAgainst?: Readonly<Record<string, readonly string[]>>;
}

const fakeGit = (repo: FakeRepo): { git: GitRunner; upstreams: string[] } => {
  const upstreams: string[] = [];
  const known = repo.knownUpstreams ?? ['origin/next', 'origin/main'];

  const git: GitRunner = (...args) => {
    if (args[0] === 'merge-base') {
      const upstream = args[2]!;

      if (!known.includes(upstream)) {
        throw new Error(`fatal: Not a valid object name ${upstream}`);
      }

      upstreams.push(upstream);

      return `base-of-${upstream}`;
    }

    if (args[0] === 'log') {
      return repo.subject ?? 'feat: something';
    }

    if (args[0] === 'diff') {
      const upstream = upstreams.at(-1)!;

      return (repo.changedAgainst?.[upstream] ?? []).join('\n');
    }

    throw new Error(`unexpected git ${args.join(' ')}`);
  };

  return { git, upstreams };
};

describe('the CHANGELOG comparison base', () => {
  it('follows the line the branch is destined for', () => {
    expect(upstreamFor('feat/whatever')).toBe('origin/next');
    expect(upstreamFor('next')).toBe('origin/next');
    expect(upstreamFor('main')).toBe('origin/main');
  });
});

describe('the CHANGELOG gate', () => {
  it('passes a branch that leaves the file alone', () => {
    const { git } = fakeGit({});

    expect(checkChangelogUntouched({ git, branch: 'feat/untouched' })).toEqual({ ok: true, reason: 'CHANGELOG.md untouched.' });
  });

  it('rejects a branch that edits the file', () => {
    const { git } = fakeGit({ changedAgainst: { 'origin/next': ['CHANGELOG.md'] } });
    const result = checkChangelogUntouched({ git, branch: 'feat/edits-changelog' });

    expect(result.ok).toBe(false);
    expect(result.reason).toContain('edits CHANGELOG.md');
  });

  it('exempts a release commit', () => {
    const { git } = fakeGit({ subject: 'chore(release): bump to 1.0.0', changedAgainst: { 'origin/next': ['CHANGELOG.md'] } });

    expect(checkChangelogUntouched({ git, branch: 'release/cut' })).toEqual({ ok: true, reason: 'release commit; skipped.' });
  });

  it('compares a commit on main against main, where the release rewrote the file', () => {
    // The gate fix that follows a bump: it touches no CHANGELOG, but every
    // commit on main differs from `next` in that file.
    const { git, upstreams } = fakeGit({ subject: 'build(ci): fix a gate after the bump', changedAgainst: { 'origin/next': ['CHANGELOG.md'] } });
    const result = checkChangelogUntouched({ git, branch: 'main' });

    expect(upstreams).toEqual(['origin/main']);
    expect(result).toEqual({ ok: true, reason: 'CHANGELOG.md untouched.' });
  });

  it('skips when the base ref is missing, rather than failing a branch it cannot judge', () => {
    const { git } = fakeGit({ knownUpstreams: [] });
    const result = checkChangelogUntouched({ git, branch: 'feat/no-remote' });

    expect(result.ok).toBe(true);
    expect(result.reason).toContain('no origin/next');
  });
});
