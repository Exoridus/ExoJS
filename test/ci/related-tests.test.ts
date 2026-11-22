import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { changedFilesBetween, selectLocalPolicy } from '../../scripts/ci/local-policy.ts';
import {
  GRAPH_MODULE_EXTENSIONS,
  isRelatedEligible,
  readsUntrackedInput,
  relatedCoreCommands,
  untrackedInputTests,
} from '../../scripts/ci/related-tests.ts';
import { changedFiles } from '../../scripts/lanes.ts';

const present = (): boolean => true;
const vitestCli = fileURLToPath(new URL('./vitest.mjs', import.meta.resolve('vitest/package.json')));

const codeLines = (file: string): string =>
  readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .filter(line => !/^\s*(?:\*|\/\/|\/\*)/.test(line))
    .join('\n');

const sourceFiles = (directory: string): string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);

    if (entry.isDirectory()) {
      return sourceFiles(path);
    }

    return path.endsWith('.ts') ? [path] : [];
  });

describe('related-test eligibility', () => {
  it('accepts changes confined to graph-tracked modules under src and test', () => {
    expect(isRelatedEligible(['src/math/Vector.ts', 'src/rendering/webgl2/shaders/sprite.vert', 'test/math/vector.test.ts'], present)).toBe(
      true,
    );
  });

  it.each([
    ['an empty change', []],
    ['a site file', ['src/math/Vector.ts', 'site/src/lib/x.ts']],
    ['a package file', ['src/math/Vector.ts', 'packages/exojs-tilemap/src/index.ts']],
    ['a declaration file', ['src/globals.d.ts']],
    ['a module kind the graph does not track', ['src/assets/readme.md']],
    ['a root config file', ['vitest.config.ts']],
  ])('keeps the whole project for %s', (_name, files) => {
    expect(isRelatedEligible(files, present)).toBe(false);
  });

  it('keeps the whole project when a module was deleted or renamed away', () => {
    expect(isRelatedEligible(['src/math/Vector.ts', 'src/math/Gone.ts'], file => file !== 'src/math/Gone.ts')).toBe(false);
  });
});

describe('tests that read input the graph cannot see', () => {
  it.each([
    ["import { readFileSync } from 'node:fs';"],
    ["import { readFile } from 'node:fs/promises';"],
    ["import fs from 'fs';"],
    ["import { execFileSync } from 'node:child_process';"],
    ["const modules = import.meta.glob('../src/**/*.ts');"],
    ['const module = await import(`../src/${name}.ts`);'],
    ['const module = await import(path);'],
    ['const module = require(path);'],
    ["const root = resolve(process.cwd(), 'src');"],
    ["import source from '../src/mesh.frag?raw';"],
    ["const worker = await import('./echo.worker.ts?worker');"],
  ])('recognizes %s', source => {
    expect(readsUntrackedInput(source)).toBe(true);
  });

  it.each([["import { Vector } from '../../src/math/Vector.ts';"], ["const module = await import('../src/lazy.ts');"]])(
    'leaves %s to the graph',
    source => {
      expect(readsUntrackedInput(source)).toBe(false);
    },
  );

  it('keeps the repository tests that scan sources and shaders', () => {
    const kept = untrackedInputTests();

    expect(kept).toContain('test/rendering/shader-source-structure.test.ts');
    expect(kept).toContain('test/release/manifest.test.ts');
  });

  it('keeps a test that imports a shader as raw text, which the graph does not link to the shader file', () => {
    expect(untrackedInputTests()).toContain('test/rendering/multi-attachment-guard.test.ts');
  });

  it('relies on no engine module reading input the graph cannot see', () => {
    expect(sourceFiles('src').filter(file => readsUntrackedInput(codeLines(file)))).toEqual([]);
  });

  it('relies on no engine module importing through a query', () => {
    const offenders = sourceFiles('src').filter(file =>
      readFileSync(file, 'utf8')
        .split(/\r?\n/)
        .some(line => /^\s*(?:import|export)\b.*['"][^'"\n]+\?[^'"\n]+['"]/.test(line)),
    );

    expect(offenders).toEqual([]);
  });

  it('runs the graph-related tests first, then the untracked-input tests by name', () => {
    const [related, untracked] = relatedCoreCommands('abc123');

    expect(related).toBe('pnpm exec vitest run --project=exojs --passWithNoTests --changed=abc123');
    expect(untracked).toContain('test/rendering/shader-source-structure.test.ts');
  });
});

// A git hook runs with `GIT_DIR` and friends set; left in place they would point
// the throwaway repository below at the real checkout.
const savedGitEnv = new Map<string, string>();

describe('graph selection against a throwaway project', () => {
  let root: string;

  const write = (file: string, content: string): void => {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), content);
  };

  const git = (...args: string[]): void => {
    execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd: root, stdio: 'ignore' });
  };

  const selectAfterTouching = (file: string): string[] => {
    write(file, `${spawnSync('git', ['show', `HEAD:${file}`], { cwd: root, encoding: 'utf8' }).stdout}\n\n`);

    const run = spawnSync(
      process.execPath,
      [vitestCli, 'list', '--filesOnly', '--changed', '--config', join(root, 'vitest.config.ts'), '--root', root],
      { cwd: root, encoding: 'utf8' },
    );

    expect({ error: run.error, status: run.status, signal: run.signal, stdout: run.stdout, stderr: run.stderr }).toMatchObject({
      error: undefined,
      status: 0,
      signal: null,
    });

    return run.stdout
      .split(/\r?\n/)
      .filter(line => line.endsWith('.test.ts'))
      .map(line => line.replace(/^\[[^\]]*\]\s*/, ''))
      .sort();
  };

  beforeEach(() => {
    for (const [key, value] of Object.entries(process.env)) {
      if (key.startsWith('GIT_') && value !== undefined) {
        savedGitEnv.set(key, value);
        delete process.env[key];
      }
    }

    root = realpathSync(mkdtempSync(join(tmpdir(), 'exojs-related-')));
    symlinkSync(join(process.cwd(), 'node_modules'), join(root, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
    write('.gitignore', 'node_modules\n');
    write(
      'vitest.config.ts',
      `import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { alias: [{ find: '@lib', replacement: ${JSON.stringify(join(root, 'src/index.ts'))} }] },
  plugins: [
    {
      name: 'shader-text',
      transform: (code, id) => (/\\.(vert|frag|glsl|wgsl)$/.test(id) ? { code: 'export default ' + JSON.stringify(code), map: null } : undefined),
    },
  ],
  test: { include: ['test/**/*.test.ts'] },
});
`,
    );
    write('src/leaf.ts', 'export const leaf = 1;\n');
    write('src/middle.ts', "import { leaf } from './leaf.ts';\nexport const middle = leaf + 1;\n");
    write('src/barrel.ts', "export * from './middle.ts';\n");
    write('src/index.ts', "export * from './barrel.ts';\n");
    write('src/lazy.ts', 'export const lazy = 1;\n');
    write('src/shader.frag', 'void main() {}\n');

    for (const extension of GRAPH_MODULE_EXTENSIONS) {
      const data = extension === 'json' ? '{"value":1}\n' : 'void main() {}\n';
      write(`src/data.${extension}`, data);
      write(
        `test/data-${extension}.test.ts`,
        `import data from '../src/data.${extension}';\nimport { it } from 'vitest';\nit('t', () => void data);\n`,
      );
    }

    write(
      'test/helper-reader.ts',
      "import { readFileSync } from 'node:fs';\nexport const read = () => readFileSync('src/leaf.ts', 'utf8');\n",
    );
    write('test/helper-chain.ts', "export { read } from './helper-reader.ts';\n");
    write(
      'test/uses-helper.test.ts',
      "import { read } from './helper-chain.ts';\nimport { it } from 'vitest';\nit('t', () => void read);\n",
    );
    // A -> B -> A cycle: A also reaches a file reader via U. A shared false cache would lose B.
    write(
      'test/helper-cycle-a.ts',
      "import { b } from './helper-cycle-b.ts';\nimport { raw } from './helper-cycle-untracked.ts';\nexport const a = () => b() + raw();\n",
    );
    write('test/helper-cycle-b.ts', "import { a } from './helper-cycle-a.ts';\nexport const b = () => a();\n");
    write(
      'test/helper-cycle-untracked.ts',
      "import { readFileSync } from 'node:fs';\nexport const raw = () => readFileSync('src/leaf.ts', 'utf8');\n",
    );
    write('test/a-cycle.test.ts', "import { a } from './helper-cycle-a.ts';\nimport { it } from 'vitest';\nit('cycle A', () => void a);\n");
    write('test/b-cycle.test.ts', "import { b } from './helper-cycle-b.ts';\nimport { it } from 'vitest';\nit('cycle B', () => void b);\n");
    write('src/unrelated.ts', 'export const unrelated = 1;\n');
    write(
      'test/transitive.test.ts',
      "import { middle } from '../src/middle.ts';\nimport { it } from 'vitest';\nit('t', () => void middle);\n",
    );
    write(
      'test/reexport.test.ts',
      "import { middle } from '../src/barrel.ts';\nimport { it } from 'vitest';\nit('t', () => void middle);\n",
    );
    write('test/alias.test.ts', "import { middle } from '@lib';\nimport { it } from 'vitest';\nit('t', () => void middle);\n");
    write('test/dynamic.test.ts', "import { it } from 'vitest';\nit('t', async () => void (await import('../src/lazy.ts')));\n");
    write(
      'test/shader.test.ts',
      "import source from '../src/shader.frag?raw';\nimport { it } from 'vitest';\nit('t', () => void source);\n",
    );
    write(
      'test/unrelated.test.ts',
      "import { unrelated } from '../src/unrelated.ts';\nimport { it } from 'vitest';\nit('t', () => void unrelated);\n",
    );
    git('init', '-q');
    git('add', '-A');
    git('commit', '-q', '-m', 'init');
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });

    for (const [key, value] of savedGitEnv) {
      process.env[key] = value;
    }

    savedGitEnv.clear();
  });

  it('follows a transitive import chain, a re-export barrel and an alias from a leaf module', () => {
    expect(selectAfterTouching('src/leaf.ts')).toEqual(['test/alias.test.ts', 'test/reexport.test.ts', 'test/transitive.test.ts']);
  });

  it('follows a literal dynamic import', () => {
    expect(selectAfterTouching('src/lazy.ts')).toEqual(['test/dynamic.test.ts']);
  });

  it('does not link a shader imported with ?raw to its file, which is why such tests are kept by name', () => {
    expect(selectAfterTouching('src/shader.frag')).not.toContain('test/shader.test.ts');
    expect(readsUntrackedInput(readFileSync(join(root, 'test/shader.test.ts'), 'utf8'))).toBe(true);
  });

  it('leaves a test whose imports the change cannot reach', () => {
    expect(selectAfterTouching('src/lazy.ts')).not.toContain('test/unrelated.test.ts');
  });

  it.each(GRAPH_MODULE_EXTENSIONS)('links a changed .%s module to the test that imports it directly', extension => {
    expect(selectAfterTouching(`src/data.${extension}`)).toEqual([`test/data-${extension}.test.ts`]);
  });

  it('keeps a test that reaches a file reader through a chain of helpers, though the test itself reads nothing', () => {
    expect(readsUntrackedInput(readFileSync(join(root, 'test/uses-helper.test.ts'), 'utf8'))).toBe(false);
    expect(untrackedInputTests(root)).toContain('test/uses-helper.test.ts');
    expect(untrackedInputTests(root)).not.toContain('test/transitive.test.ts');
  });

  it('keeps both tests when a helper import cycle reaches an untracked reader only after the cycle', () => {
    const kept = untrackedInputTests(root);

    expect(kept).toContain('test/a-cycle.test.ts');
    expect(kept).toContain('test/b-cycle.test.ts');
  });
});

describe('renamed and deleted paths', () => {
  let root: string;

  const git = (...args: string[]): string =>
    execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd: root, encoding: 'utf8' });

  beforeEach(() => {
    for (const [key, value] of Object.entries(process.env)) {
      if (key.startsWith('GIT_') && value !== undefined) {
        savedGitEnv.set(key, value);
        delete process.env[key];
      }
    }

    root = realpathSync(mkdtempSync(join(tmpdir(), 'exojs-rename-')));
    git('init', '-q');
    mkdirSync(join(root, 'src'));
    writeFileSync(join(root, 'src/old.ts'), `${'export const value = 1;\n'.repeat(20)}`);
    git('add', '-A');
    git('commit', '-q', '-m', 'init');
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });

    for (const [key, value] of savedGitEnv) {
      process.env[key] = value;
    }

    savedGitEnv.clear();
  });

  it('reports the original path of a detected rename, so the change is not eligible for narrowing', () => {
    git('mv', 'src/old.ts', 'src/new.ts');
    git('commit', '-q', '-m', 'rename');

    // Git itself reports this as an exact rename; without it the test would prove nothing.
    expect(git('diff', '--name-status', 'HEAD~1', 'HEAD')).toMatch(/^R100\s+src\/old\.ts\s+src\/new\.ts/);

    const files = changedFilesBetween('HEAD~1', 'HEAD', root);

    expect(files.sort()).toEqual(['src/new.ts', 'src/old.ts']);
    expect(isRelatedEligible(files, file => existsSync(join(root, file)))).toBe(false);
  });

  it('reports a rename in the working tree and index the same way', () => {
    git('mv', 'src/old.ts', 'src/new.ts');

    expect(changedFiles('HEAD', root).sort()).toEqual(['src/new.ts', 'src/old.ts']);
  });

  it('preserves exact Git paths in committed and untracked changes', () => {
    const files = ['src/Größe.ts', 'src/space name.ts', 'src/ padded .ts'];

    if (process.platform !== 'win32') {
      files.push('src/tab\tname.ts', 'src/new\nline.ts', 'src/back\\slash.ts', 'src/quote"name.ts');
    }

    for (const file of files) {
      writeFileSync(join(root, file), 'export const value = 1;\n');
    }

    expect(changedFiles('HEAD', root).sort()).toEqual([...files].sort());
    git('add', '-A');
    git('commit', '-q', '-m', 'paths');

    expect(changedFilesBetween('HEAD~1', 'HEAD', root).sort()).toEqual([...files].sort());
    expect(changedFiles('HEAD~1', root).sort()).toEqual([...files].sort());
  });

  it('keeps the whole core project when a changed engine file was renamed', () => {
    expect(selectLocalPolicy(['src/new.ts', 'src/definitely-missing-original.ts']).relatedCore).toBe(false);
  });
});
