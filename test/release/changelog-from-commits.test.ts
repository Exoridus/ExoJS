import { describe, expect, test } from 'vitest';

import { UNRELEASED_HEADING } from '../../scripts/release/changelog';
import {
  classifyCommit,
  mentionedPullRequests,
  prependToUnreleased,
  renderUnreleasedEntries,
  unreleasedSectionOf,
} from '../../scripts/release/changelogFromCommits';

const REPO = 'https://github.com/example/repo';

const commit = (subject: string, body = ''): { hash: string; subject: string; body: string } => ({ hash: 'abc', subject, body });

describe('classifyCommit', () => {
  test('files feat under Added, fix under Fixed, refactor under Changed, docs under Documentation', () => {
    expect(classifyCommit(commit('feat(scene): add a thing (#12)'))?.heading).toBe('Added');
    expect(classifyCommit(commit('fix: stop a thing (#13)'))?.heading).toBe('Fixed');
    expect(classifyCommit(commit('refactor(api): rename a thing (#14)'))?.heading).toBe('Changed');
    expect(classifyCommit(commit('docs(guide): explain a thing (#15)'))?.heading).toBe('Documentation');
  });

  test('a breaking marker files the entry under Changed whatever its type', () => {
    const entry = classifyCommit(commit('feat(input)!: rename keys (#16)'));

    expect(entry?.heading).toBe('Changed');
    expect(entry?.breaking).toBe(true);
  });

  test('ci, build, test, chore and style commits stay out unless they are breaking', () => {
    expect(classifyCommit(commit('ci: narrow the lanes (#17)'))).toBeNull();
    expect(classifyCommit(commit('build: stamp the dist (#18)'))).toBeNull();
    expect(classifyCommit(commit('build!: drop the umd bundle (#19)'))?.heading).toBe('Changed');
  });

  test('keeps the pull request number and capitalises the subject', () => {
    const entry = classifyCommit(commit('feat: add a thing (#12)', 'Body text.'));

    expect(entry?.pullRequest).toBe(12);
    expect(entry?.title).toBe('Add a thing');
    expect(entry?.body).toBe('Body text.');
  });

  test('ignores a subject that is not a conventional header', () => {
    expect(classifyCommit(commit('Merge branch next'))).toBeNull();
  });
});

describe('renderUnreleasedEntries', () => {
  test('groups by heading, breaking changes first, and links the pull request', () => {
    const entries = [
      classifyCommit(commit('feat: add a thing (#1)', 'It does things.'))!,
      classifyCommit(commit('refactor: rename a thing (#2)'))!,
      classifyCommit(commit('feat!: change a contract (#3)'))!,
    ];
    const rendered = renderUnreleasedEntries(entries, '', REPO);

    expect(rendered.indexOf('### Changed')).toBeLessThan(rendered.indexOf('### Added'));
    expect(rendered.indexOf('BREAKING: Change a contract')).toBeLessThan(rendered.indexOf('Rename a thing'));
    expect(rendered).toContain(`([#1](${REPO}/pull/1))`);
    expect(rendered).toContain('  It does things.');
  });

  test('skips entries whose pull request the section already names', () => {
    const entries = [classifyCommit(commit('feat: add a thing (#1)'))!, classifyCommit(commit('fix: fix a thing (#2)'))!];
    const rendered = renderUnreleasedEntries(entries, '- **Hand-written.** ([#1](x/pull/1))', REPO);

    expect(rendered).not.toContain('Add a thing');
    expect(rendered).toContain('Fix a thing');
  });

  test('renders nothing when every entry is present', () => {
    const entries = [classifyCommit(commit('feat: add a thing (#1)'))!];

    expect(renderUnreleasedEntries(entries, 'see (#1)', REPO)).toBe('');
  });
});

describe('unreleased section helpers', () => {
  const changelog = `# Changelog\n\n${UNRELEASED_HEADING}\n\n### Fixed\n\n- something (#7)\n\n## [0.16.1] - 2026-09-02\n\n- older (#5)\n`;

  test('unreleasedSectionOf stops at the next dated heading', () => {
    const section = unreleasedSectionOf(changelog, UNRELEASED_HEADING);

    expect(section).toContain('(#7)');
    expect(section).not.toContain('(#5)');
    expect(mentionedPullRequests(section)).toEqual(new Set([7]));
  });

  test('prependToUnreleased inserts ahead of the existing entries and is a no-op for empty input', () => {
    const filled = prependToUnreleased(changelog, UNRELEASED_HEADING, '### Added\n\n- **New.** ([#9](x/pull/9))');

    expect(filled.indexOf('- **New.**')).toBeLessThan(filled.indexOf('### Fixed'));
    expect(filled.indexOf('- **New.**')).toBeGreaterThan(filled.indexOf(UNRELEASED_HEADING));
    expect(prependToUnreleased(changelog, UNRELEASED_HEADING, '')).toBe(changelog);
  });

  test('prependToUnreleased refuses a changelog without the section', () => {
    expect(() => prependToUnreleased('# Changelog\n', UNRELEASED_HEADING, 'x')).toThrow(/no "## \[Unreleased\]"/u);
  });
});
