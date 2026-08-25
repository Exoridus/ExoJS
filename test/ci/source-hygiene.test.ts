import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Pins what `scripts/check-source-hygiene.ts` treats as development provenance,
 * against the two mistakes a pattern-based scanner makes: missing a real
 * citation, and flagging a word that only looks like one.
 *
 * "Session" is the case that forced the distinction. A `SceneTransitionSession`
 * is a session and its doc comments say so, so "this session" cannot be
 * provenance on its own -- the comment has to also recount a conversation.
 * Every other phrase the rule matches names a tool or a past sitting and has no
 * second reading.
 *
 * The scanner runs as a subprocess rather than being imported, because
 * importing it runs it: the CLI body is top-level. That also makes this a test
 * of the gate itself, exit code included, rather than of an internal function
 * the gate might stop calling. One invocation covers every case, because a
 * process spawn per assertion costs more than the whole rest of the suite.
 */
const REPO_ROOT = resolve(__dirname, '../..');
const SCANNER = 'scripts/check-source-hygiene.ts';
const FIXTURE_DIRECTORY = 'test/ci/hygiene-fixtures';

/** Comments that use "session" as domain vocabulary and must stay silent. */
const ACCEPTED: Readonly<Record<string, string>> = {
  'bare-mention': '/** Stops this session. */',
  'qualified-session': '/** Releases resources owned by this transition session. */',
  'definite-article': '/** The active session keeps the state. */',
  'compound-noun': '/** Session ownership is per root. */',
  'type-name': '/** SceneTransitionSession keeps the transition state. */',
  'two-sentences': '/**\n * This session owns the transition state.\n *\n * It remains active until all transitions complete.\n */',
};

/** Comments that name a tool, a past sitting, or a conversation. */
const REJECTED: Readonly<Record<string, string>> = {
  'named-tool': '// Claude session notes: use the retained path.',
  'other-named-tool': '// Codex session: regenerated the manifest.',
  'generic-agent': '// The agent session left this here.',
  'past-sitting': '// Fixed in a previous session.',
  'earlier-sitting': '// Left over from an earlier session.',
  'recounted-request': '// In this session the user requested the retained path.',
  'recounted-decision': '// This session decided to keep the flag.',
  'back-reference': '// As discussed in this session, use the retained path.',
  'conversation-one-sentence-later': '/**\n * This session owns the transition state.\n *\n * The behaviour was requested rather than measured.\n */',
};

/** A string literal is not a comment, however much it reads like one. */
const STRING_LITERAL_ONLY = "export const text = 'as discussed in this session, ask Claude';\n";

let report = '';
let status = 0;

beforeAll(() => {
  mkdirSync(resolve(REPO_ROOT, FIXTURE_DIRECTORY), { recursive: true });

  let index = 0;
  const files: string[] = [];

  for (const [name, comment] of [...Object.entries(ACCEPTED), ...Object.entries(REJECTED)]) {
    writeFileSync(resolve(REPO_ROOT, FIXTURE_DIRECTORY, `${name}.ts`), `${comment}\nexport const value${index++} = 1;\n`, 'utf8');
    files.push(`${FIXTURE_DIRECTORY}/${name}.ts`);
  }

  writeFileSync(resolve(REPO_ROOT, FIXTURE_DIRECTORY, 'string-literal.ts'), STRING_LITERAL_ONLY, 'utf8');
  files.push(`${FIXTURE_DIRECTORY}/string-literal.ts`);

  try {
    report = execFileSync('node', [join('node_modules', 'tsx', 'dist', 'cli.mjs'), SCANNER, ...files], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    const failure = error as { status?: number; stdout?: string; stderr?: string };

    status = failure.status ?? 1;
    report = `${failure.stdout ?? ''}${failure.stderr ?? ''}`;
  }
});

afterAll(() => {
  rmSync(resolve(REPO_ROOT, FIXTURE_DIRECTORY), { recursive: true, force: true });
});

/** Every reported line for one fixture, so an assertion names the case it failed on. */
const findingsFor = (name: string): string[] => {
  return report.split('\n').filter(line => line.includes(`${FIXTURE_DIRECTORY}/${name}.ts:`));
};

describe('source hygiene: session vocabulary', () => {
  it('scans the fixtures at all', () => {
    expect(report).toMatch(/scanned \d+ source file\(s\)/);
    expect(report).not.toMatch(/scanned 0 source file\(s\)/);
  });

  it.each(Object.keys(ACCEPTED))('accepts %s', name => {
    expect(findingsFor(name)).toEqual([]);
  });

  it.each(Object.keys(REJECTED))('rejects %s', name => {
    expect(findingsFor(name).join('\n')).toContain('agent-provenance');
  });

  it('ignores provenance inside a string literal', () => {
    expect(findingsFor('string-literal')).toEqual([]);
  });

  it('fails the gate when any fixture is provenance', () => {
    expect(status).not.toBe(0);
  });
});
