/**
 * The `Unreleased` section, derived from the squash commits since the last
 * release instead of edited by hand in every pull request.
 *
 * Every squash merge carries a Conventional Commits subject with the pull
 * request number and the pull request description as its body, so the
 * changelog can be assembled at the cut: the type files the entry under a
 * Keep a Changelog heading, the subject becomes the headline, the body the
 * prose. Pull requests never touch `CHANGELOG.md`, which is what used to make
 * two of them conflict whenever both landed an entry at the top of the same
 * section.
 *
 * Kept apart from the cut script so it can be tested; nothing here touches git
 * except {@link readCommitsSince}.
 */

import { execFileSync } from 'node:child_process';

export type ChangelogHeading = 'Added' | 'Changed' | 'Fixed' | 'Documentation';

export interface ReleaseCommit {
  readonly hash: string;
  readonly subject: string;
  readonly body: string;
}

export interface ChangelogEntry {
  readonly heading: ChangelogHeading;
  readonly breaking: boolean;
  readonly pullRequest: number | null;
  readonly title: string;
  readonly body: string;
}

const HEADING_ORDER: readonly ChangelogHeading[] = ['Changed', 'Added', 'Fixed', 'Documentation'];

const SUBJECT_PATTERN = /^(?<type>[a-z]+)(?:\((?<scope>[^)]*)\))?(?<bang>!)?:\s*(?<subject>.+?)(?:\s*\(#(?<pr>\d+)\))?\s*$/u;

/** Types whose commits carry no user-facing change and stay out of the changelog. */
const SILENT_TYPES = new Set(['ci', 'build', 'test', 'chore', 'style']);

const headingFor = (type: string, breaking: boolean): ChangelogHeading | null => {
  if (breaking) return 'Changed';

  switch (type) {
    case 'feat':
      return 'Added';
    case 'fix':
    case 'perf':
      return 'Fixed';
    case 'refactor':
      return 'Changed';
    case 'docs':
      return 'Documentation';
    default:
      return null;
  }
};

/** Drop git trailers (session links, sign-offs) that belong to the commit, not to the release notes. */
const TRAILER_PATTERN = /^(?:Claude-Session|Co-authored-by|Signed-off-by|Reviewed-by):\s/u;

const stripTrailers = (body: string): string =>
  body
    .split('\n')
    .filter(line => !TRAILER_PATTERN.test(line))
    .join('\n')
    .replace(/\n{3,}/gu, '\n\n')
    .trim();

/**
 * Turn one squash commit into an entry, or `null` when its type is silent or
 * its subject is not a Conventional Commits header.
 */
export const classifyCommit = (commit: ReleaseCommit): ChangelogEntry | null => {
  const match = SUBJECT_PATTERN.exec(commit.subject);

  if (match?.groups === undefined) return null;

  const { type, bang, subject, pr } = match.groups;
  const breaking = bang === '!' || /^BREAKING CHANGE:/mu.test(commit.body);

  if (SILENT_TYPES.has(type!) && !breaking) return null;

  const heading = headingFor(type!, breaking);

  if (heading === null) return null;

  return {
    heading,
    breaking,
    pullRequest: pr !== undefined ? Number(pr) : null,
    title: subject!.charAt(0).toUpperCase() + subject!.slice(1),
    body: stripTrailers(commit.body),
  };
};

/** Pull request numbers already mentioned in a changelog section, written as `(#N)` or as a `/pull/N` link. */
export const mentionedPullRequests = (section: string): Set<number> => {
  const found = new Set<number>();

  for (const match of section.matchAll(/(?:\(#|\/pull\/)(\d+)\)?/gu)) found.add(Number(match[1]));

  return found;
};

const indentBody = (body: string): string =>
  body
    .split('\n')
    .map(line => (line.trim().length === 0 ? '' : `  ${line}`))
    .join('\n')
    .replace(/\n{3,}/gu, '\n\n');

const renderEntry = (entry: ChangelogEntry, repoUrl: string): string => {
  const link = entry.pullRequest !== null ? ` ([#${entry.pullRequest}](${repoUrl}/pull/${entry.pullRequest}))` : '';
  const flag = entry.breaking ? 'BREAKING: ' : '';
  const head = `- **${flag}${entry.title}.**${link}`;

  return entry.body.length > 0 ? `${head}\n${indentBody(entry.body)}` : head;
};

/**
 * Render `entries` grouped under Keep a Changelog headings, breaking changes
 * first within `Changed`. Entries whose pull request already appears in
 * `existingSection` are skipped, so a hand-written entry wins and a cut that
 * was interrupted after a partial write does not duplicate anything.
 */
export const renderUnreleasedEntries = (entries: readonly ChangelogEntry[], existingSection: string, repoUrl: string): string => {
  const present = mentionedPullRequests(existingSection);
  const fresh = entries.filter(entry => entry.pullRequest === null || !present.has(entry.pullRequest));
  const blocks: string[] = [];

  for (const heading of HEADING_ORDER) {
    const group = fresh.filter(entry => entry.heading === heading).sort((a, b) => Number(b.breaking) - Number(a.breaking));

    if (group.length === 0) continue;

    blocks.push(`### ${heading}\n\n${group.map(entry => renderEntry(entry, repoUrl)).join('\n')}`);
  }

  return blocks.join('\n\n');
};

/**
 * Insert `rendered` at the top of the `Unreleased` section, ahead of whatever
 * the section already holds. Returns the changelog unchanged when there is
 * nothing to insert.
 */
export const prependToUnreleased = (changelog: string, unreleasedHeading: string, rendered: string): string => {
  if (rendered.length === 0) return changelog;

  const start = changelog.indexOf(unreleasedHeading);

  if (start === -1) throw new Error(`CHANGELOG.md has no "${unreleasedHeading}" section to fill.`);

  const insertAt = start + unreleasedHeading.length;

  return `${changelog.slice(0, insertAt)}\n\n${rendered}${changelog.slice(insertAt)}`;
};

/** The body text of the `Unreleased` section, up to the next `## ` heading. */
export const unreleasedSectionOf = (changelog: string, unreleasedHeading: string): string => {
  const start = changelog.indexOf(unreleasedHeading);

  if (start === -1) return '';

  const rest = changelog.slice(start + unreleasedHeading.length);
  const next = rest.search(/^## /mu);

  return next === -1 ? rest : rest.slice(0, next);
};

/** Squash commits on the first-parent line of `HEAD` since `sinceRef`, newest first. */
export const readCommitsSince = (sinceRef: string, cwd: string): ReleaseCommit[] => {
  const raw = execFileSync('git', ['log', '--first-parent', '--format=%H%x00%s%x00%b%x01', `${sinceRef}..HEAD`], { cwd, encoding: 'utf8' });

  return raw
    .split('\u0001')
    .map(record => record.replace(/^\n/u, ''))
    .filter(record => record.length > 0)
    .map(record => {
      const [hash = '', subject = '', body = ''] = record.split('\u0000');

      return { hash, subject, body };
    });
};

/** The newest release tag reachable from `HEAD`. */
export const latestReleaseTag = (cwd: string): string =>
  execFileSync('git', ['describe', '--tags', '--abbrev=0', '--match', 'v*'], { cwd, encoding: 'utf8' }).trim();
