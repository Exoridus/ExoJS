/**
 * Tests for site/src/lib/source-snippets.ts
 *
 * Uses real temporary files so the extractor exercises the
 * actual readFileSync path without touching any checked-in source files.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// We test the module via a dynamic import so we can override import.meta.dirname
// to point at our temp directory. Instead, we directly import the function and
// pass absolute paths. The `filePath` parameter is joined with repoRoot(), but
// repoRoot() may resolve to process.cwd() in vitest. We work around this by
// writing fixture files relative to process.cwd() in a temp sub-dir.
//
// Actually: extractSnippetRegion joins repoRoot() + filePath. In vitest the
// cwd is the repo root, so we can create real fixture files under a temp
// sub-folder and pass relative paths.
import { extractSnippetRegion } from '../../site/src/lib/source-snippets';

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

let TMP_DIR: string;
let TMP_REL: string; // relative to repo root (== process.cwd() in vitest)

beforeAll(() => {
    // Create a temp directory under .workspace so it is gitignored.
    const base = join(process.cwd(), '.workspace', 'test-snippets');
    mkdirSync(base, { recursive: true });
    TMP_DIR = mkdtempSync(join(base, 'tmp-'));
    // Relative path from repo root to our temp dir.
    TMP_REL = TMP_DIR.slice(process.cwd().length).replace(/\\/g, '/').replace(/^\//, '');
});

afterAll(() => {
    rmSync(TMP_DIR, { recursive: true, force: true });
});

function writeFixture(name: string, content: string): string {
    const abs = join(TMP_DIR, name);
    writeFileSync(abs, content, 'utf8');
    return `${TMP_REL}/${name}`;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('extractSnippetRegion', () => {
    describe('happy path', () => {
        test('extracts lines between markers', () => {
            const rel = writeFixture('basic.ts', [
                'const a = 1;',
                '// #region guide:my-region',
                'const b = 2;',
                'const c = 3;',
                '// #endregion guide:my-region',
                'const d = 4;',
            ].join('\n'));

            const result = extractSnippetRegion(rel, 'my-region');
            expect(result).toBe('const b = 2;\nconst c = 3;');
        });

        test('marker lines are not included in the output', () => {
            const rel = writeFixture('markers.ts', [
                '// #region guide:zone',
                'doSomething();',
                '// #endregion guide:zone',
            ].join('\n'));

            const result = extractSnippetRegion(rel, 'zone');
            expect(result).not.toContain('#region');
            expect(result).not.toContain('#endregion');
        });

        test('dedent: common leading whitespace is removed', () => {
            const rel = writeFixture('indented.ts', [
                'class Foo {',
                '    // #region guide:method',
                '    override init(): void {',
                '        this.x = 1;',
                '    }',
                '    // #endregion guide:method',
                '}',
            ].join('\n'));

            const result = extractSnippetRegion(rel, 'method');
            expect(result).toBe('override init(): void {\n    this.x = 1;\n}');
        });

        test('preserves relative indentation within the region', () => {
            const rel = writeFixture('relative-indent.ts', [
                '// #region guide:block',
                '    if (x) {',
                '        y = 1;',
                '    }',
                '// #endregion guide:block',
            ].join('\n'));

            const result = extractSnippetRegion(rel, 'block');
            // 4-space indent stripped; inner block retains 4 spaces of relative indent
            expect(result).toBe('if (x) {\n    y = 1;\n}');
        });

        test('trailing empty lines are stripped', () => {
            const rel = writeFixture('trailing.ts', [
                '// #region guide:r',
                'foo();',
                '',
                '',
                '// #endregion guide:r',
            ].join('\n'));

            const result = extractSnippetRegion(rel, 'r');
            expect(result).toBe('foo();');
        });
    });

    describe('error cases', () => {
        test('throws for a missing file', () => {
            expect(() =>
                extractSnippetRegion('does/not/exist.ts', 'any-region'),
            ).toThrow('[SourceSnippet] File not found');
        });

        test('throws for a missing file and includes path in message', () => {
            expect(() =>
                extractSnippetRegion('does/not/exist.ts', 'any-region'),
            ).toThrow('does/not/exist.ts');
        });

        test('throws for a region not found, with region name in message', () => {
            const rel = writeFixture('no-region.ts', 'const x = 1;\n');

            expect(() =>
                extractSnippetRegion(rel, 'missing-region'),
            ).toThrow('missing-region');
        });

        test('throws for a duplicate region', () => {
            const rel = writeFixture('duplicate.ts', [
                '// #region guide:dup',
                'first();',
                '// #endregion guide:dup',
                '// #region guide:dup',
                'second();',
                '// #endregion guide:dup',
            ].join('\n'));

            expect(() =>
                extractSnippetRegion(rel, 'dup'),
            ).toThrow('Duplicate region');
        });

        test('throws for an empty region', () => {
            const rel = writeFixture('empty.ts', [
                '// #region guide:empty',
                '   ',
                '// #endregion guide:empty',
            ].join('\n'));

            expect(() =>
                extractSnippetRegion(rel, 'empty'),
            ).toThrow('empty');
        });

        test('does not confuse regions with similar names', () => {
            const rel = writeFixture('similar.ts', [
                '// #region guide:foo',
                'inFoo();',
                '// #endregion guide:foo',
                '// #region guide:foo-bar',
                'inFooBar();',
                '// #endregion guide:foo-bar',
            ].join('\n'));

            expect(extractSnippetRegion(rel, 'foo')).toBe('inFoo();');
            expect(extractSnippetRegion(rel, 'foo-bar')).toBe('inFooBar();');
        });
    });
});
