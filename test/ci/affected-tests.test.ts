// @vitest-environment node
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createVitest, type Vitest } from 'vitest/node';

import { selectAffectedTests } from '../../scripts/ci/affected-tests.ts';

const repository = process.cwd();
const vitestCli = fileURLToPath(new URL('./vitest.mjs', import.meta.resolve('vitest/package.json')));

describe('affected tests from the Vite graph', () => {
  let root: string;
  let context: Vitest | undefined;

  const write = (file: string, content: string): void => {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), content);
  };

  const test = (file: string, imports: string, assertion = 'expect(value).toBe(1)'): void =>
    write(file, `${imports}\nimport { expect, it } from 'vitest';\nit('observes its input', () => { ${assertion}; });\n`);

  const initialize = async (): Promise<Vitest> => {
    context = await createVitest({ root, config: join(root, 'vitest.config.ts'), watch: false });

    return context;
  };

  const select = async (...files: string[]) => selectAffectedTests(await initialize(), files);

  beforeEach(() => {
    root = realpathSync(mkdtempSync(join(tmpdir(), 'exojs-affected-')));
    symlinkSync(join(repository, 'node_modules'), join(root, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
    write('package.json', '{"type":"module"}\n');
    write(
      'vitest.config.ts',
      `export default {
  resolve: { alias: { '@leaf': ${JSON.stringify(join(root, 'src/leaf.ts'))}, '@workspace': ${JSON.stringify(join(root, 'linked-package/index.ts'))} } },
  test: { name: 'unit', include: ['test/**/*.test.ts'], environment: 'node' },
};\n`,
    );
    write('src/leaf.ts', 'export const value = 1;\n');
    write('src/barrel.ts', "export { value } from './leaf.ts';\n");
    write('src/unrelated.ts', 'export const value = 1;\n');
    test('test/related.test.ts', "import { value } from '../src/barrel.ts';");
    test('test/unrelated.test.ts', "import { value } from '../src/unrelated.ts';");
  });

  afterEach(async () => {
    await context?.close();
    context = undefined;
    rmSync(root, { recursive: true, force: true });
  });

  it('follows aliases, re-exports and literal dynamic imports without executing tests', async () => {
    test('test/alias.test.ts', "import { value } from '@leaf';");
    test('test/dynamic.test.ts', '', "void import('../src/leaf.ts')");
    write('test/not-executed.test.ts', "throw new Error('discovery must not execute test modules');\n");

    const selection = await select('src/leaf.ts');

    expect(selection.mode).toBe('related');
    expect(selection.tests.map(entry => entry.file)).toEqual(['test/alias.test.ts', 'test/dynamic.test.ts', 'test/related.test.ts']);
    expect(selection.tests.find(entry => entry.file === 'test/related.test.ts')?.reasons).toContainEqual(
      expect.objectContaining({
        kind: 'dependency',
        change: 'src/leaf.ts',
        path: ['src/leaf.ts', 'src/barrel.ts', 'test/related.test.ts'],
      }),
    );
    expect(selection.inventory).toHaveLength(5);
  });

  it('selects Unicode source paths directly without relying on Git quoting', async () => {
    write('src/Größe.ts', 'export const value = 1;\n');
    test('test/unicode.test.ts', "import { value } from '../src/Größe.ts';");

    expect((await select('src/Größe.ts')).tests.map(entry => entry.file)).toEqual(['test/unicode.test.ts']);
  });

  it('matches a raw import by its resolved file rather than its query module id', async () => {
    write('src/message.txt', 'hello\n');
    test('test/raw.test.ts', "import value from '../src/message.txt?raw';", "expect(value).toBe('hello\\n')");

    const selection = await select('src/message.txt');

    expect(selection.mode).toBe('related');
    expect(selection.tests.map(entry => entry.file)).toEqual(['test/raw.test.ts']);
  });

  it.each(['vert', 'frag', 'glsl', 'wgsl', 'json'])('follows a changed .%s module through its configured loader', async extension => {
    write(`src/data.${extension}`, extension === 'json' ? '{"value":1}' : 'void main() {}');
    write(
      'vitest.config.ts',
      `export default {
  plugins: [{ name: 'shader-text', transform(code, id) {
    return /\\.(vert|frag|glsl|wgsl)$/.test(id) ? { code: 'export default ' + JSON.stringify(code), map: null } : undefined;
  } }],
  test: { name: 'unit', include: ['test/**/*.test.ts'] },
};\n`,
    );
    test('test/data.test.ts', `import value from '../src/data.${extension}';`, 'void value');

    const selection = await select(`src/data.${extension}`);

    expect(selection.mode).toBe('related');
    expect(selection.tests.map(entry => entry.file)).toEqual(['test/data.test.ts']);
  });

  it('treats raw TypeScript as text without resolving the imports inside its contents', async () => {
    write('src/example.ts', "import { missing } from '@external/playground';\nexport const value = missing;\n");
    test('test/raw-source.test.ts', "import value from '../src/example.ts?raw';", 'void value');

    const selection = await select('src/example.ts');

    expect(selection.mode).toBe('related');
    expect(selection.tests.map(entry => entry.file)).toEqual(['test/raw-source.test.ts']);
    expect(selection.tests[0]?.reasons).toContainEqual(expect.objectContaining({ kind: 'dependency', change: 'src/example.ts' }));
  });

  it('still inspects an executable import when the same source is also imported raw', async () => {
    write('src/example.ts', "import { missing } from '@external/playground';\nexport const value = missing;\n");
    test('test/raw-source.test.ts', "import value from '../src/example.ts?raw';", 'void value');
    test('test/executable-source.test.ts', "import { value } from '../src/example.ts';", 'void value');

    const selection = await select('src/example.ts');

    expect(selection.mode).toBe('full');
    expect(selection.tests).toHaveLength(selection.inventory.length);
    expect(selection.fallbackReasons.join(' ')).toMatch(/graph|resolve|transform/i);
  });

  it('preserves module-owned watch attribution across scenarios in one context', async () => {
    write('src/message.txt', 'hello\n');
    test('test/raw.test.ts', "import value from '../src/message.txt?raw';", 'void value');
    const initialized = await initialize();

    await selectAffectedTests(initialized, ['src/leaf.ts']);
    const selection = await selectAffectedTests(initialized, ['src/message.txt']);

    expect(selection.mode).toBe('related');
    expect(selection.fallbackReasons).toEqual([]);
    expect(selection.tests.map(entry => entry.file)).toEqual(['test/raw.test.ts']);
  });

  it('traverses a query worker through its resolved source and child imports', async () => {
    write('src/worker-leaf.ts', 'export const value = 1;\n');
    write('src/task.ts', "import { value } from './worker-leaf.ts';\nself.onmessage = () => self.postMessage(value);\n");
    test('test/worker.test.ts', "import Worker from '../src/task.ts?worker';", "expect(typeof Worker).toBe('function')");

    const selection = await select('src/worker-leaf.ts');

    expect(selection.mode).toBe('related');
    expect(selection.tests.map(entry => entry.file)).toEqual(['test/worker.test.ts']);
    expect(selection.tests[0]?.reasons).toContainEqual(expect.objectContaining({ kind: 'dependency', change: 'src/worker-leaf.ts' }));
  });

  it('follows a workspace alias through a realpath-resolved symlink', async () => {
    write('packages/math/src/leaf.ts', 'export const value = 1;\n');
    write('packages/math/src/index.ts', "export { value } from './leaf.ts';\n");
    symlinkSync(join(root, 'packages/math/src'), join(root, 'linked-package'), process.platform === 'win32' ? 'junction' : 'dir');
    test('test/workspace.test.ts', "import { value } from '@workspace';");

    expect((await select('packages/math/src/leaf.ts')).tests.map(entry => entry.file)).toEqual(['test/workspace.test.ts']);
  });

  it('retains a cyclic helper reader even when the changed source has no import edge to it', async () => {
    write('test/helpers/a.ts', "import './b.ts';\nexport const value = 1;\n");
    write(
      'test/helpers/b.ts',
      "import './a.ts';\nimport { readFileSync } from 'node:fs';\nexport const read = () => readFileSync('README.md', 'utf8');\n",
    );
    test('test/reader.test.ts', "import { value } from './helpers/a.ts';");
    write('src/unobserved.ts', 'export const unused = 1;\n');

    const selection = await select('src/unobserved.ts');

    expect(selection.tests.map(entry => entry.file)).toEqual(['test/reader.test.ts']);
    expect(selection.tests[0]?.reasons).toContainEqual(
      expect.objectContaining({ kind: 'untracked', path: expect.arrayContaining(['test/helpers/b.ts']) }),
    );
  });

  it.each([
    ['fetch', "export const value = () => fetch('/data.json');"],
    ['URL asset', "export const value = new URL('../data.bin', import.meta.url);"],
    ['nonliteral import', 'export const value = (path: string) => import(path);'],
    ['glob', "export const value = import.meta.glob('../src/*.ts');"],
    ['child process', "import { execFileSync } from 'node:child_process'; export const value = () => execFileSync('node', []);"],
  ])('retains %s readers regardless of the changed import closure', async (_label, source) => {
    write('test/helper.ts', source);
    test('test/reader.test.ts', "import { value } from './helper.ts';", 'void value');
    write('src/unobserved.ts', 'export const unused = 1;\n');

    expect((await select('src/unobserved.ts')).tests.some(entry => entry.file === 'test/reader.test.ts')).toBe(true);
  });

  it.each([
    ['an aliased fetch', 'const load = fetch; export const value = () => load("/data.json");'],
    ['a computed global reader', 'const name = "fetch"; export const value = () => globalThis[name]("/data.json");'],
    ['a DOM asset assignment', 'export const value = (image: HTMLImageElement, path: string) => { image.src = path; };'],
    ['runtime builtin access', 'export const value = () => process.getBuiltinModule("fs").readFileSync("README.md");'],
  ])('retains hidden input through %s', async (_label, source) => {
    write('test/helper.ts', source);
    test('test/reader.test.ts', "import { value } from './helper.ts';", 'void value');
    write('src/unobserved.ts', 'export const unused = 1;\n');

    const selection = await select('src/unobserved.ts');

    expect(selection.tests.map(entry => entry.file)).toEqual(['test/reader.test.ts']);
    expect(selection.tests[0]?.reasons.some(reason => reason.kind === 'untracked')).toBe(true);
  });

  it.each([
    ['an image attribute', "const image = document.createElement('img'); image.setAttribute('src', '/src/photo.svg');"],
    ['a namespaced href attribute', "element.setAttributeNS('http://www.w3.org/1999/xlink', 'href', '/src/photo.svg');"],
    ['a dynamic attribute', "const attribute = 'src'; element.setAttribute(attribute, '/src/photo.svg');"],
    ['an aliased attribute setter', "const assign = element.setAttribute.bind(element); assign('src', '/src/photo.svg');"],
    ['a CSS background image', "element.style.backgroundImage = 'url(/src/photo.svg)';"],
    ['a computed CSS property', "element.style['backgroundImage'] = 'url(/src/photo.svg)';"],
    ['a CSS property setter', "element.style.setProperty('background-image', 'url(/src/photo.svg)');"],
    ['CSS text', "element.style.cssText = 'background: url(/src/photo.svg)';"],
    ['a stylesheet rule', "sheet.insertRule('body { background: url(/src/photo.svg) }');"],
    ['HTML content', 'element.innerHTML = \'<img src="/src/photo.svg">\';'],
  ])('retains %s readers when another test already imports the changed asset', async (_label, body) => {
    write('src/photo.svg', '<svg xmlns="http://www.w3.org/2000/svg"/>');
    test('test/asset.test.ts', "import value from '../src/photo.svg?raw';", 'void value');
    write('test/helper.ts', `export const value = (element, sheet) => { ${body} };\n`);
    test('test/reader.test.ts', "import { value } from './helper.ts';", 'void value');

    const selection = await select('src/photo.svg');

    expect(selection.mode).toBe('related');
    expect(selection.tests.map(entry => entry.file)).toEqual(['test/asset.test.ts', 'test/reader.test.ts']);
    expect(selection.tests.find(entry => entry.file === 'test/reader.test.ts')?.reasons).toContainEqual(
      expect.objectContaining({ kind: 'untracked', path: ['test/helper.ts', 'test/reader.test.ts'] }),
    );
  });

  it('does not classify literal styling without URLs or metadata attributes as asset loads', async () => {
    write('src/photo.svg', '<svg xmlns="http://www.w3.org/2000/svg"/>');
    test('test/asset.test.ts', "import value from '../src/photo.svg?raw';", 'void value');
    write(
      'test/helper.ts',
      "export const value = element => { element.style.cssText = 'color: red'; element.setAttribute('aria-label', 'example'); };\n",
    );
    test('test/nonreader.test.ts', "import { value } from './helper.ts';", 'void value');

    expect((await select('src/photo.svg')).tests.map(entry => entry.file)).toEqual(['test/asset.test.ts']);
  });

  it('does not collapse a shared test file across distinct projects', async () => {
    write(
      'vitest.config.ts',
      "export default {test:{projects:[{test:{name:'a',include:['test/**/*.test.ts']}},{test:{name:'b',include:['test/**/*.test.ts']}}]}};\n",
    );

    const selection = await select('src/leaf.ts');

    expect(selection.inventory).toHaveLength(4);
    expect(selection.tests.map(({ project, file }) => ({ project, file }))).toEqual([
      { project: 'a', file: 'test/related.test.ts' },
      { project: 'b', file: 'test/related.test.ts' },
    ]);
  });

  it('does not certify an empty or undiscoverable test inventory', async () => {
    write('vitest.config.ts', "export default {test:{include:['missing/**/*.test.ts']}};\n");

    await expect(select('src/leaf.ts')).rejects.toThrow(/inventory/i);
  });

  it('retains consumers of virtual modules without treating their ids as filesystem paths', async () => {
    write(
      'vitest.config.ts',
      `export default {
  plugins: [{ name: 'virtual-input', resolveId: id => id === 'virtual:input' ? '\\0virtual:input' : undefined, load: id => id === '\\0virtual:input' ? 'export default 1' : undefined }],
  test: { name: 'unit', include: ['test/**/*.test.ts'] },
};\n`,
    );
    test('test/virtual.test.ts', "import value from 'virtual:input';");
    write('src/unobserved.ts', 'export const unused = 1;\n');

    const selection = await select('src/unobserved.ts');

    expect(selection.mode).toBe('related');
    expect(selection.tests.map(entry => entry.file)).toEqual(['test/virtual.test.ts']);
    expect(selection.tests[0]?.reasons.some(reason => reason.kind === 'untracked')).toBe(true);
  });

  it('selects every test using a changed setup dependency', async () => {
    write('test/setup-leaf.ts', 'export const value = 1;\n');
    write('test/setup.ts', "import { value } from './setup-leaf.ts';\nvoid value;\n");
    write('vitest.config.ts', "export default {test:{name:'unit',include:['test/**/*.test.ts'],setupFiles:['test/setup.ts']}};\n");

    const selection = await select('test/setup-leaf.ts');

    expect(selection.tests.map(entry => entry.file)).toEqual(['test/related.test.ts', 'test/unrelated.test.ts']);
    expect(selection.tests.every(entry => entry.reasons.some(reason => reason.kind === 'setup'))).toBe(true);
  });

  it('does not treat type annotations or blob URL setup as hidden file readers', async () => {
    write(
      'test/setup.ts',
      `import { vi } from 'vitest';
type Platform = { url: URL; worker: Worker; fetch: typeof fetch; constructor: Function };
export const describe = (_input: Platform): void => {};
if (typeof URL.createObjectURL === 'undefined') {
  Object.defineProperty(URL, 'createObjectURL', { value: vi.fn().mockReturnValue('blob:mock') });
}
if (typeof URL.revokeObjectURL === 'undefined') {
  Object.defineProperty(URL, 'revokeObjectURL', { value: vi.fn() });
}
`,
    );
    write('vitest.config.ts', "export default {test:{name:'unit',include:['test/**/*.test.ts'],setupFiles:['test/setup.ts']}};\n");

    const selection = await select('src/leaf.ts');

    expect(selection.mode).toBe('related');
    expect(selection.tests.map(entry => entry.file)).toEqual(['test/related.test.ts']);
  });

  it('still retains a setup file that captures a URL constructor for dynamic assets', async () => {
    write('test/setup.ts', "const AssetURL = URL; export const asset = () => new AssetURL('./data.bin', import.meta.url);\n");
    write('vitest.config.ts', "export default {test:{name:'unit',include:['test/**/*.test.ts'],setupFiles:['test/setup.ts']}};\n");

    const selection = await select('src/leaf.ts');

    expect(selection.tests).toHaveLength(2);
    expect(selection.tests.every(entry => entry.reasons.some(reason => reason.kind === 'setup'))).toBe(true);
  });

  it('follows Vite plugin watch edges even if another import gives the input a module identity', async () => {
    write('src/include.frag', 'included shader text\n');
    write('src/shader.frag', 'shader text\n');
    write(
      'vitest.config.ts',
      `import { readFileSync } from 'node:fs';
export default {
  plugins: [{ name: 'shader-includes', load(id) {
    if (!id.endsWith('.frag')) return;
    if (id.endsWith('/shader.frag')) this.addWatchFile(${JSON.stringify(join(root, 'src/include.frag'))});
    return 'export default ' + JSON.stringify(readFileSync(id, 'utf8'));
  } }],
  test: { name: 'unit', include: ['test/**/*.test.ts'] },
};\n`,
    );
    test('test/shader.test.ts', "import value from '../src/shader.frag';", 'void value');
    test('test/include.test.ts', "import value from '../src/include.frag?raw';", 'void value');

    const selection = await select('src/include.frag');

    expect(selection.mode).toBe('related');
    expect(selection.tests.map(entry => entry.file)).toEqual(['test/include.test.ts', 'test/shader.test.ts']);
    expect(selection.tests.find(entry => entry.file === 'test/shader.test.ts')?.reasons).toContainEqual(
      expect.objectContaining({ kind: 'dependency', path: ['src/include.frag', 'src/shader.frag', 'test/shader.test.ts'] }),
    );
  });

  it('widens for startup watch inputs whose readers have no module owner', async () => {
    write(
      'vitest.config.ts',
      `export default {
  plugins: [{ name: 'global-reader', buildStart() { this.addWatchFile(${JSON.stringify(join(root, 'src/leaf.ts'))}); } }],
  test: { name: 'unit', include: ['test/**/*.test.ts'] },
};\n`,
    );

    const selection = await select('src/leaf.ts');

    expect(selection.mode).toBe('full');
    expect(selection.tests).toHaveLength(selection.inventory.length);
    expect(selection.fallbackReasons.join(' ')).toMatch(/watch.*leaf\.ts/i);
  });

  it.each([
    'vitest.config.ts',
    'package.json',
    'scripts/generate.ts',
    'packages/exojs-build/src/shaderPlugin.ts',
    'packages/exojs-build/src/assetContainer.ts',
    'packages/exojs-config/src/generated-plugin.ts',
    'packages/exojs-cli/src/commands/assetsPack.ts',
    'mystery.bin',
  ])('widens for global or unknown input %s', async file => {
    if (file !== 'vitest.config.ts' && file !== 'package.json') {
      write(file, '');
    }

    const selection = await select(file);

    expect(selection.mode).toBe('full');
    expect(selection.tests).toHaveLength(selection.inventory.length);
    expect(selection.fallbackReasons.join(' ')).toContain(file);
  });

  it('widens for a deleted or renamed source and an empty changed-file inventory', async () => {
    const initialized = await initialize();

    for (const files of [['src/deleted.ts'], ['src/deleted.ts', 'src/leaf.ts'], []]) {
      const selection = await selectAffectedTests(initialized, files);

      expect(selection.mode).toBe('full');
      expect(selection.tests).toHaveLength(2);
      expect(selection.fallbackReasons.length).toBeGreaterThan(0);
    }
  });

  it('returns an explicitly empty selection only after proving no dependencies reach a valid source', async () => {
    write('src/unobserved.ts', 'export const unused = 1;\n');

    const selection = await select('src/unobserved.ts');

    expect(selection.mode).toBe('related');
    expect(selection.tests).toEqual([]);
    expect(selection.inventory).toHaveLength(2);
  });

  it('widens if a transform or import cannot be resolved', async () => {
    test('test/broken.test.ts', "import { value } from './missing-helper.ts';");

    const selection = await select('src/leaf.ts');

    expect(selection.mode).toBe('full');
    expect(selection.tests).toHaveLength(3);
    expect(selection.fallbackReasons.join(' ')).toMatch(/graph|resolve|transform/i);
  });

  it('restores the caller configuration after discovering explicit changes', async () => {
    const initialized = await initialize();
    const related = initialized.config.related;
    const changed = initialized.config.changed;
    const triggers = initialized.config.forceRerunTriggers;

    await selectAffectedTests(initialized, ['src/leaf.ts']);

    expect(initialized.config.related).toBe(related);
    expect(initialized.config.changed).toBe(changed);
    expect(initialized.config.forceRerunTriggers).toBe(triggers);
  });

  it('selects the test that fails after a real source mutation', async () => {
    write('src/leaf.ts', 'export const value = 2;\n');
    const selection = await select('src/leaf.ts');
    await context?.close();
    context = undefined;

    expect(selection.tests.map(entry => entry.file)).toEqual(['test/related.test.ts']);

    const run = spawnSync(
      'node',
      [
        vitestCli,
        'run',
        '--root',
        root,
        '--config',
        join(root, 'vitest.config.ts'),
        ...selection.tests.map(entry => resolve(root, entry.file)),
      ],
      { cwd: root, encoding: 'utf8' },
    );

    expect(run.status).toBe(1);
    expect(`${run.stdout}\n${run.stderr}`).toContain('expected 2 to be 1');
  });
});
