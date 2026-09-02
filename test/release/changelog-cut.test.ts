import { datedHeadingPattern, dateUnreleasedSection, hasCuttableChangelog, UNRELEASED_HEADING } from '../../scripts/release/changelog';

/**
 * The release cut dates the `Unreleased` section rather than expecting a dated
 * one to have been written ahead of it. Writing it ahead would contradict
 * `release-coherence`, which requires the newest dated section to match the
 * version in `package.json`.
 */

const changelogWith = (body: string): string => `# Changelog\n\nAll notable changes are documented here.\n\n${body}`;

const unreleased = changelogWith(`${UNRELEASED_HEADING}\n\n### Fixed\n\n- something\n\n## [0.16.0] - 2026-09-01\n\n- older\n`);

describe('dating the changelog for a release cut', () => {
  test('files the unreleased entries under the version and leaves an empty section above', () => {
    const dated = dateUnreleasedSection(unreleased, '0.16.1', '2026-09-02');

    expect(datedHeadingPattern('0.16.1').test(dated)).toBe(true);
    expect(dated).toContain(UNRELEASED_HEADING);
    // The entries stay where they were, which puts them under the new heading.
    expect(dated.indexOf('- something')).toBeGreaterThan(dated.indexOf('## [0.16.1] - 2026-09-02'));
    expect(dated.indexOf('## [0.16.1] - 2026-09-02')).toBeLessThan(dated.indexOf('## [0.16.0]'));
  });

  test('is a no-op once the version has a dated section', () => {
    const dated = dateUnreleasedSection(unreleased, '0.16.1', '2026-09-02');

    // An interrupted cut leaves both the dated section and the empty heading
    // above it; dating again would file a second section under one version.
    expect(dateUnreleasedSection(dated, '0.16.1', '2026-09-03')).toBe(dated);
    expect(dated.match(/^## \[0\.16\.1\]/gm)).toHaveLength(1);
  });

  test('leaves a changelog without an unreleased section untouched', () => {
    const none = changelogWith('## [0.16.0] - 2026-09-01\n\n- older\n');

    expect(dateUnreleasedSection(none, '0.16.1', '2026-09-02')).toBe(none);
  });

  test('accepts a changelog to cut only when there is something to name', () => {
    expect(hasCuttableChangelog(unreleased, '0.16.1')).toBe(true);
    expect(hasCuttableChangelog(dateUnreleasedSection(unreleased, '0.16.1', '2026-09-02'), '0.16.1')).toBe(true);
    expect(hasCuttableChangelog(changelogWith('## [0.16.0] - 2026-09-01\n'), '0.16.1')).toBe(false);
  });
});
