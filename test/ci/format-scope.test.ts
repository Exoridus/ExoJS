import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { chunkFiles, FORMAT_CONFIG_FILES, formatRangeFiles, selectFormatScope } from '../../scripts/ci/format-scope.ts';
import { runCommand } from '../../scripts/lib/run-command.ts';

const present = (): boolean => true;
const prettierCli = fileURLToPath(import.meta.resolve('prettier/bin/prettier.cjs'));
const posixNames = [
  ['a tab', 'src/tab\tname.ts'],
  ['a newline', 'src/line\nbreak.ts'],
];

describe('format scope selection', () => {
  it('checks exactly the changed files that still exist', () => {
    expect(selectFormatScope(['src/math/Vector.ts', 'test/math/vector.test.ts'], present)).toEqual({
      mode: 'files',
      files: ['src/math/Vector.ts', 'test/math/vector.test.ts'],
    });
  });

  it('drops duplicates and empty entries but never rewrites a real path', () => {
    expect(selectFormatScope(['src/math/Vector.ts', 'src/math/Vector.ts', ''], present)).toEqual({
      mode: 'files',
      files: ['src/math/Vector.ts'],
    });
    expect(selectFormatScope([' lead.ts', 'trail.ts ', 'back\\slash.ts'], present)).toEqual({
      mode: 'files',
      files: [' lead.ts', 'trail.ts ', 'back\\slash.ts'],
    });
  });

  it('leaves a deleted file out and skips a range that only deletes', () => {
    const exists = (file: string): boolean => file !== 'src/Gone.ts';

    expect(selectFormatScope(['src/Gone.ts', 'src/Kept.ts'], exists)).toEqual({ mode: 'files', files: ['src/Kept.ts'] });
    expect(selectFormatScope(['src/Gone.ts'], exists)).toEqual({ mode: 'skip' });
  });

  it('takes the whole repository for an empty range, which is no evidence of an unchanged tree', () => {
    expect(selectFormatScope([], present)).toEqual({ mode: 'full' });
  });

  it.each([
    'package.json',
    'site/package.json',
    'pnpm-lock.yaml',
    'pnpm-workspace.yaml',
    '.editorconfig',
    '.prettierignore',
    '.gitignore',
    '.prettierrc.json',
    'prettier.config.mjs',
    'packages/exojs-config/prettier/index.js',
    'packages/exojs-config/package.json',
    'packages/create-exo-app/templates/minimal/.gitignore',
    'examples/.editorconfig',
  ])('takes the whole repository when %s changes alongside ordinary files', file => {
    expect(selectFormatScope(['src/math/Vector.ts', file], present)).toEqual({ mode: 'full' });
  });

  it('takes the whole repository for a config file even when it was deleted', () => {
    expect(selectFormatScope(['.prettierignore'], () => false)).toEqual({ mode: 'full' });
  });

  it('declares every manifest that carries a prettier key as a config file', () => {
    const manifests = (directory: string): string[] =>
      readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
        if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name.startsWith('.')) {
          return [];
        }

        const path = join(directory, entry.name);

        return entry.isDirectory() ? manifests(path) : entry.name === 'package.json' ? [path] : [];
      });

    const declaring = manifests('.')
      .filter(file => 'prettier' in (JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>))
      .map(file => file.replaceAll('\\', '/').replace(/^\.\//, ''));

    expect(declaring.length).toBeGreaterThan(0);

    for (const file of declaring) {
      expect(FORMAT_CONFIG_FILES.has(file) || file.startsWith('packages/exojs-config/'), `${file} must trigger the full check`).toBe(true);
    }
  });
});

describe('command-line batching', () => {
  it('keeps every file once, in order, and each batch under the limit', () => {
    const files = Array.from({ length: 500 }, (_, index) => `packages/exojs-tilemap/src/layers/Layer${index}.ts`);
    const chunks = chunkFiles(files, 6000);

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.flat()).toEqual(files);

    for (const chunk of chunks) {
      expect(chunk.join(' ').length).toBeLessThanOrEqual(6000);
    }
  });

  it('never splits a name or produces an empty batch, and passes an oversized name alone', () => {
    expect(chunkFiles([], 100)).toEqual([]);
    expect(chunkFiles(['a b.ts', 'c.ts'], 100)).toEqual([['a b.ts', 'c.ts']]);
    expect(chunkFiles(['x'.repeat(200), 'y.ts'], 100)).toEqual([['x'.repeat(200)], ['y.ts']]);
  });
});

// A git hook runs with `GIT_DIR` and friends set; left in place they would point
// the throwaway repository at the real checkout.
const savedGitEnv = new Map<string, string>();

const scrubGitEnv = (): void => {
  for (const [key, value] of Object.entries(process.env)) {
    if (key.startsWith('GIT_') && value !== undefined) {
      savedGitEnv.set(key, value);
      delete process.env[key];
    }
  }
};

const restoreGitEnv = (): void => {
  for (const [key, value] of savedGitEnv) {
    process.env[key] = value;
  }

  savedGitEnv.clear();
};

describe('pushed range', () => {
  let root: string;

  const git = (...args: string[]): string =>
    execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd: root, encoding: 'utf8' });

  const write = (file: string, content: string): void => {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), content);
  };

  const scope = (): ReturnType<typeof selectFormatScope> =>
    selectFormatScope(formatRangeFiles('HEAD~1', 'HEAD', root), file => existsSync(join(root, file)));

  beforeEach(() => {
    scrubGitEnv();
    root = realpathSync(mkdtempSync(join(tmpdir(), 'exojs-format-')));
    git('init', '-q');
    write('src/a.ts', `${'export const a = 1;\n'.repeat(20)}`);
    write('src/b.ts', 'export const b = 1;\n');
    write('docs/note.md', '# Note\n');
    git('add', '-A');
    git('commit', '-q', '-m', 'init');
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
    restoreGitEnv();
  });

  it('selects a modified and an added file from a committed range', () => {
    write('src/a.ts', `${'export const a = 2;\n'.repeat(20)}`);
    write('src/new.ts', 'export const n = 1;\n');
    git('add', '-A');
    git('commit', '-q', '-m', 'change');

    expect(scope()).toEqual({ mode: 'files', files: ['src/a.ts', 'src/new.ts'] });
  });

  it('selects the new path of a detected rename and not the vanished original', () => {
    git('mv', 'src/a.ts', 'src/renamed.ts');
    git('commit', '-q', '-m', 'rename');

    expect(git('diff', '--name-status', 'HEAD~1', 'HEAD')).toMatch(/^R100\s+src\/a\.ts\s+src\/renamed\.ts/);
    expect(scope()).toEqual({ mode: 'files', files: ['src/renamed.ts'] });
  });

  it.each([
    ['unicode', 'src/\u00E4\u00F6\u00FC-\u65E5\u672C.ts'],
    ['whitespace', 'src/with space.ts'],
    ['leading and trailing space', 'src/ padded .ts'],
    ['quote and dollar', "src/it's $HOME.ts"],
    ['shell metacharacters', 'src/a&b;c(d).ts'],
  ])('reports a file with %s in its name exactly as it is on disk', (_name, file) => {
    write(file, 'export const n = 1;\n');
    git('add', '-A');
    git('commit', '-q', '-m', 'awkward');

    expect(formatRangeFiles('HEAD~1', 'HEAD', root)).toEqual([file]);
    expect(scope()).toEqual({ mode: 'files', files: [file] });
  });

  // Windows cannot create control-character filenames, but Git trees can still contain them.
  it.skipIf(process.platform === 'win32').each(posixNames)('reports a file with %s in its name on POSIX', (_name, file) => {
    write(file, 'export const n = 1;\n');
    git('add', '-A');
    git('commit', '-q', '-m', 'awkward');

    expect(formatRangeFiles('HEAD~1', 'HEAD', root)).toEqual([file]);
    expect(scope()).toEqual({ mode: 'files', files: [file] });
  });

  it('reads NUL-separated control-character paths without checking them out', () => {
    const blob = git('rev-parse', 'HEAD:src/b.ts').trim();
    const files = posixNames.map(([, file]) => file.slice('src/'.length)).sort();
    const tree = execFileSync('git', ['mktree', '-z'], {
      cwd: root,
      encoding: 'utf8',
      input: git('ls-tree', '-z', 'HEAD') + files.map(file => `100644 blob ${blob}\t${file}\0`).join(''),
    }).trim();
    const commit = git('commit-tree', tree, '-p', 'HEAD', '-m', 'control characters').trim();

    expect(formatRangeFiles('HEAD', commit, root)).toEqual(files);
    expect(selectFormatScope(formatRangeFiles('HEAD', commit, root), present)).toEqual({ mode: 'files', files });
  });

  it('reports the new awkward path of a rename and omits the old one', () => {
    git('mv', 'src/a.ts', 'src/\u00FCber space.ts');
    git('commit', '-q', '-m', 'rename');

    expect(scope()).toEqual({ mode: 'files', files: ['src/\u00FCber space.ts'] });
  });

  it('skips a range that only deletes awkward files', () => {
    write('src/\u00E4 gone.ts', 'export const g = 1;\n');
    git('add', '-A');
    git('commit', '-q', '-m', 'add');
    git('rm', '-q', 'src/\u00E4 gone.ts');
    git('commit', '-q', '-m', 'delete');

    expect(scope()).toEqual({ mode: 'skip' });
  });

  it('skips a range that only deletes files', () => {
    git('rm', '-q', 'src/b.ts', 'docs/note.md');
    git('commit', '-q', '-m', 'delete');

    expect(scope()).toEqual({ mode: 'skip' });
  });

  it('keeps only the survivors of a range that deletes and edits', () => {
    git('rm', '-q', 'src/b.ts');
    write('docs/note.md', '# Note\n\nMore.\n');
    git('add', '-A');
    git('commit', '-q', '-m', 'mixed');

    expect(scope()).toEqual({ mode: 'files', files: ['docs/note.md'] });
  });

  it('takes the whole repository when the range touches the formatter configuration', () => {
    write('.prettierignore', 'dist\n');
    write('src/a.ts', 'export const a = 3;\n');
    git('add', '-A');
    git('commit', '-q', '-m', 'config');

    expect(scope()).toEqual({ mode: 'full' });
  });

  it('cannot resolve a missing base, which the gate runner answers with the full check', () => {
    expect(() => formatRangeFiles('deadbeef'.repeat(5), 'HEAD', root)).toThrow();
  });
});

describe('selective prettier invocation', () => {
  let root: string;

  const check = (...files: string[]): number | null => {
    const result = spawnSync(
      process.execPath,
      [prettierCli, '--check', '--ignore-unknown', '--no-error-on-unmatched-pattern', '--', ...files],
      { cwd: root, encoding: 'utf8' },
    );

    expect({ error: result.error, signal: result.signal, stdout: result.stdout, stderr: result.stderr }).toMatchObject({
      error: undefined,
      signal: null,
      stdout: expect.any(String),
      stderr: expect.any(String),
    });

    return result.status;
  };

  beforeEach(() => {
    root = realpathSync(mkdtempSync(join(tmpdir(), 'exojs-prettier-')));
    writeFileSync(join(root, '.prettierrc.json'), '{"singleQuote":true}\n');
    writeFileSync(join(root, '.prettierignore'), 'ignored/\n');
    mkdirSync(join(root, 'ignored'));
    writeFileSync(join(root, 'good.ts'), "export const a = 'x';\n");
    writeFileSync(join(root, 'bad.ts'), 'export const a = "x"\n');
    writeFileSync(join(root, 'with space.ts'), 'export const a = "x"\n');
    writeFileSync(join(root, 'ignored', 'bad.ts'), 'export const a = "x"\n');
    writeFileSync(join(root, 'blob.bin'), 'not a source file');
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('accepts formatted files and rejects an unformatted one', () => {
    expect(check('good.ts')).toBe(0);
    expect(check('good.ts', 'bad.ts')).toBe(1);
  });

  it('reaches a file whose name contains a space', () => {
    expect(check('with space.ts')).toBe(1);
  });

  it('honors the ignore file and unsupported file types as the full check does', () => {
    expect(check('ignored/bad.ts')).toBe(0);
    expect(check('blob.bin')).toBe(0);
  });

  it('passes names with spaces and shell metacharacters through runCommand to Prettier', async () => {
    const names = ["it's $HOME.ts", 'a&b;c(d).ts', '\u00E4 \u65E5.ts', ' lead.ts'];

    for (const name of names) {
      writeFileSync(join(root, name), 'export const a = "x"\n');
    }

    const run = (files: string[]): Promise<{ status: number }> =>
      runCommand({
        label: 'format-smoke',
        command: process.execPath,
        args: [prettierCli, '--check', '--ignore-unknown', '--', ...files],
        cwd: root,
        output: 'silent',
      });

    for (const name of names) {
      expect(`${name}:${(await run([name])).status}`).toBe(`${name}:1`);
    }

    expect((await run(['good.ts'])).status).toBe(0);
  });
});
