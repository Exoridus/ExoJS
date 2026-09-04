/**
 * Fill the `Unreleased` section of CHANGELOG.md from the squash commits since
 * the last release tag.
 *
 *   pnpm release:changelog            # print what would be added
 *   pnpm release:changelog --write    # add it to CHANGELOG.md
 *   pnpm release:changelog --since v0.16.0
 *
 * Entries for pull requests the section already names are skipped, so the
 * command is safe to repeat and a hand-written entry is never overwritten. The
 * release cut runs this in write mode before dating the section.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { CHANGELOG_PATH, UNRELEASED_HEADING } from './changelog.ts';
import {
  classifyCommit,
  latestReleaseTag,
  prependToUnreleased,
  readCommitsSince,
  renderUnreleasedEntries,
  unreleasedSectionOf,
} from './changelogFromCommits.ts';

const REPO_URL = 'https://github.com/Exoridus/ExoJS';

export interface GenerateChangelogResult {
  readonly since: string;
  readonly commits: number;
  readonly entries: number;
  readonly rendered: string;
}

/** Assemble the missing entries; writes the file only when `write` is set. */
export const generateChangelog = (repoRoot: string, options: { readonly since?: string; readonly write: boolean }): GenerateChangelogResult => {
  const since = options.since ?? latestReleaseTag(repoRoot);
  const path = resolve(repoRoot, CHANGELOG_PATH);
  const changelog = readFileSync(path, 'utf8');
  const commits = readCommitsSince(since, repoRoot);
  const entries = commits.map(classifyCommit).filter((entry): entry is NonNullable<typeof entry> => entry !== null);
  const rendered = renderUnreleasedEntries(entries, unreleasedSectionOf(changelog, UNRELEASED_HEADING), REPO_URL);

  if (options.write && rendered.length > 0) {
    writeFileSync(path, prependToUnreleased(changelog, UNRELEASED_HEADING, rendered), 'utf8');
  }

  return { since, commits: commits.length, entries: entries.length, rendered };
};

const isMain = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const args = process.argv.slice(2);
  const sinceIndex = args.indexOf('--since');
  const since = sinceIndex !== -1 ? args[sinceIndex + 1] : undefined;
  const write = args.includes('--write');
  const repoRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)));
  const result = generateChangelog(repoRoot, since !== undefined ? { since, write } : { write });

  console.log(`release:changelog: ${result.commits} commit(s) since ${result.since}, ${result.entries} changelog entr${result.entries === 1 ? 'y' : 'ies'}.`);

  if (result.rendered.length === 0) {
    console.log('Nothing to add: every entry is already in the Unreleased section.');
  } else if (write) {
    console.log(`Added to ${CHANGELOG_PATH}; review the wording before the cut.`);
  } else {
    console.log(`\n${result.rendered}\n`);
  }
}
