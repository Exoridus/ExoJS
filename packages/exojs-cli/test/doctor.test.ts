import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { evaluateBrowserTargets } from '../src/browserTargets';
import { runDoctor } from '../src/commands/doctor';

let projectDir: string;
let lines: string[];

const write = (relativePath: string, contents: string): void => {
  const target = join(projectDir, relativePath);

  mkdirSync(join(target, '..'), { recursive: true });
  writeFileSync(target, contents);
};

const writeManifest = (manifest: unknown): void => write('package.json', JSON.stringify(manifest));

/** Install a package into the project's `node_modules` as far as `doctor` looks at it. */
const install = (name: string, manifest: unknown): void => write(join('node_modules', name, 'package.json'), JSON.stringify(manifest));

const report = (): string => lines.join('\n');

beforeEach(() => {
  projectDir = mkdtempSync(join(tmpdir(), 'exo-doctor-'));
  lines = [];
  vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => lines.push(args.join(' ')));
});

afterEach(() => {
  vi.restoreAllMocks();
  rmSync(projectDir, { recursive: true, force: true });
});

/** A project that passes every required check, so a test can break exactly one thing. */
const healthyProject = (): void => {
  writeManifest({ name: 'app', dependencies: { '@codexo/exojs': '^0.17.0' }, packageManager: 'npm@11.0.0', browserslist: ['chrome >= 120', 'firefox >= 141'] });
  write('package-lock.json', '{}');
  install('@codexo/exojs', { version: '0.17.0', devEngines: { runtime: { name: 'node', version: `^${process.versions.node.split('.')[0]}` } } });
  install(join('@codexo', 'exojs-particles'), { version: '0.17.0' });
};

describe('exo doctor', () => {
  test('a directory with no package.json is not a project', () => {
    expect(() => runDoctor([projectDir])).toThrow(`no readable package.json in "${projectDir}"`);
  });

  test('a project that does not depend on the engine says so', () => {
    writeManifest({ name: 'app' });

    expect(() => runDoctor([projectDir])).toThrow(`"${projectDir}" does not depend on @codexo/exojs`);
  });

  test('a healthy project passes every required check', () => {
    healthyProject();

    expect(runDoctor([projectDir])).toBe(0);
    expect(report()).toContain('doctor: this project is ready.');
  });

  test('reports the Node version against the range the engine declares', () => {
    healthyProject();
    install('@codexo/exojs', { version: '0.17.0', devEngines: { runtime: { name: 'node', version: '^18' } } });

    expect(runDoctor([projectDir])).toBe(1);
    expect(report()).toContain('@codexo/exojs asks for ^18');
    expect(report()).toContain('fix: install a Node matching ^18');
  });

  test('two lockfiles are a failure, because the tree depends on who installed', () => {
    healthyProject();
    write('pnpm-lock.yaml', '');

    expect(runDoctor([projectDir])).toBe(1);
    expect(report()).toContain('two package managers own this project');
  });

  test('a lockfile that disagrees with packageManager is a failure', () => {
    healthyProject();
    rmSync(join(projectDir, 'package-lock.json'));
    write('pnpm-lock.yaml', '');

    expect(runDoctor([projectDir])).toBe(1);
    expect(report()).toContain('packageManager pins npm@11.0.0');
  });

  test('an extension off the engine version line is a failure with the install command', () => {
    healthyProject();
    install(join('@codexo', 'exojs-particles'), { version: '0.16.2' });

    expect(runDoctor([projectDir])).toBe(1);
    expect(report()).toContain('@codexo/exojs@0.17.0 vs @codexo/exojs-particles@0.16.2');
    expect(report()).toContain('fix: npm install @codexo/exojs-particles@0.17');
  });

  test('independently versioned packages are not held to the lockstep line', () => {
    healthyProject();
    install(join('@codexo', 'exojs-build'), { version: '0.1.0' });
    install(join('@codexo', 'exojs-cli'), { version: '0.1.0' });

    expect(runDoctor([projectDir])).toBe(0);
  });

  test('a browser target that cannot run WebGL2 is a failure', () => {
    healthyProject();
    writeManifest({ name: 'app', dependencies: { '@codexo/exojs': '^0.17.0' }, packageManager: 'npm@11.0.0', browserslist: ['safari >= 14'] });

    expect(runDoctor([projectDir])).toBe(1);
    expect(report()).toContain("safari 14 cannot run WebGL2, the engine's baseline backend");
  });

  test('a target that runs WebGL2 but not WebGPU is reported, not failed', () => {
    healthyProject();
    writeManifest({ name: 'app', dependencies: { '@codexo/exojs': '^0.17.0' }, packageManager: 'npm@11.0.0', browserslist: ['chrome >= 90'] });

    expect(runDoctor([projectDir])).toBe(0);
    expect(report()).toContain('WebGPU falls back to WebGL2 on chrome 90');
  });

  test('reads targets from .browserslistrc when there is one', () => {
    healthyProject();
    write('.browserslistrc', '# comment\nsafari >= 14\n');

    expect(runDoctor([projectDir])).toBe(1);
    expect(report()).toContain('safari 14 cannot run WebGL2');
  });
});

describe('browser target evaluation', () => {
  test('resolves the explicit query forms', () => {
    const { targets } = evaluateBrowserTargets(['chrome >= 120', 'firefox 141', 'ios_saf >= 26']);

    expect(targets).toEqual([
      { browser: 'chrome', version: 120, webgl2: true, webgpu: true },
      { browser: 'firefox', version: 141, webgl2: true, webgpu: true },
      { browser: 'ios_saf', version: 26, webgl2: true, webgpu: true },
    ]);
  });

  test('normalises the names browserslist spells more than one way', () => {
    const { targets } = evaluateBrowserTargets(['ff >= 141', 'ios >= 26', 'chromeandroid >= 121']);

    expect(targets.map(target => target.browser)).toEqual(['firefox', 'ios_saf', 'and_chr']);
  });

  test('a query needing the browserslist database is reported, not guessed at', () => {
    const { targets, unevaluated } = evaluateBrowserTargets(['defaults', 'last 2 versions', '> 0.5%', 'chrome >= 120']);

    expect(targets).toHaveLength(1);
    expect(unevaluated).toEqual(['defaults', 'last 2 versions', '> 0.5%']);
  });

  test('a browser the engine has no table for is unevaluated rather than unsupported', () => {
    const { targets, unevaluated } = evaluateBrowserTargets(['kaios >= 3']);

    expect(targets).toHaveLength(0);
    expect(unevaluated).toEqual(['kaios >= 3']);
  });
});
