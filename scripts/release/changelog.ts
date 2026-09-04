/**
 * The CHANGELOG half of the release cut, kept apart from `cut.ts` so it can be
 * tested: that file runs on import.
 *
 * Entries are assembled under `## [Unreleased]` by the cut from the squash
 * commits since the last tag (see `changelogFromCommits.ts`) - the Keep a
 * Changelog shape the file declares in its own second line - and the cut then
 * dates that section. Writing a dated heading ahead of the cut instead
 * contradicts `release-coherence`, which requires the newest dated section to
 * match the version in `package.json`: every pull request between the two would
 * fail on a heading naming a version nobody has bumped to yet.
 */
import { readFileSync, writeFileSync } from 'node:fs';

export const CHANGELOG_PATH = 'CHANGELOG.md';
export const UNRELEASED_HEADING = '## [Unreleased]';

/** Matches the heading this version would be filed under once dated. */
export const datedHeadingPattern = (version: string): RegExp =>
  new RegExp(String.raw`^## \[${version.replace(/\./g, String.raw`\.`)}\] - \d{4}-\d{2}-\d{2}`, 'm');

/** Whether the changelog is ready to be cut: something to date, or already dated. */
export const hasCuttableChangelog = (changelog: string, version: string): boolean =>
  changelog.includes(UNRELEASED_HEADING) || datedHeadingPattern(version).test(changelog);

/**
 * Date the `Unreleased` section as `version`, leaving an empty one above it.
 *
 * Returns the changelog unchanged when this version already has a dated
 * section: an interrupted cut leaves BOTH that section and the empty
 * `Unreleased` heading above it, and dating again would file a second section
 * under the same version.
 */
export const dateUnreleasedSection = (changelog: string, version: string, today: string): string => {
  if (datedHeadingPattern(version).test(changelog) || !changelog.includes(UNRELEASED_HEADING)) {
    return changelog;
  }

  return changelog.replace(
    UNRELEASED_HEADING,
    `${UNRELEASED_HEADING}

## [${version}] - ${today}`,
  );
};

/** Apply {@link dateUnreleasedSection} to the file; `true` when it changed. */
export const dateChangelogFile = (path: string, version: string, today = new Date().toISOString().slice(0, 10)): boolean => {
  const changelog = readFileSync(path, 'utf8');
  const dated = dateUnreleasedSection(changelog, version, today);

  if (dated === changelog) {
    return false;
  }

  writeFileSync(path, dated, 'utf8');

  return true;
};
