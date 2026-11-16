import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

import { GATE_GROUPS, orderGates } from '../../scripts/ci/gate-groups.ts';
import { needsDist, parseLocalLaneOptions, selectLocalLanes } from '../../scripts/ci/local-lanes.ts';
import { CI_TOOLING_FILES, isCiTooling, selectLocalPolicy } from '../../scripts/ci/local-policy.ts';
import { effectiveLanes, selectAreas } from '../../scripts/ci/select-lanes.ts';

const lanesFor = (file: string) => {
  const options = parseLocalLaneOptions(['--tests-only']);

  return selectLocalLanes(effectiveLanes(selectAreas([file])), options, [file]);
};

describe('local validation policy', () => {
  it('keeps CI gate inventory independent of local selection', () => {
    expect(GATE_GROUPS.typecheck).toContain('typecheck:packages');
    expect(GATE_GROUPS.sync).toContain('perf:smoke');
  });

  it('selects only content consumers for README and guide changes', () => {
    const readme = selectLocalPolicy(['README.md']);
    expect(readme.gates).toEqual(['format:check']);
    expect(readme.unitProjects).toEqual(['exojs']);
    expect(readme.unitFilter).toBe('test/site');
    expect(readme.browser).toEqual([]);
    expect(readme.smoke).toBe(false);

    const guide = selectLocalPolicy(['site/src/content/guide/getting-started.mdx']);
    expect(guide.gates).toContain('typecheck:guides');
    expect(guide.gates).toContain('typecheck:site');
    expect(guide.gates).not.toContain('typecheck:packages');
    expect(guide.unitProjects).toEqual(['exojs']);
    expect(guide.unitFilter).toBe('test/site');
    expect(guide.browser).toEqual([]);
  });

  it('keeps pure core changes on core tests and rendering changes on browser and perf lanes', () => {
    for (const file of ['src/math/Random.ts', 'src/input/gamepadMappings.ts']) {
      const policy = selectLocalPolicy([file]);
      expect(policy.gates).toContain('typecheck');
      expect(policy.gates).toContain('typecheck:test');
      expect(policy.gates).toContain('lint');
      expect(policy.unitProjects).toEqual(['exojs']);
      expect(policy.browser).toEqual([]);
      expect(policy.smoke).toBe(false);
    }

    const rendering = selectLocalPolicy(['src/rendering/Renderer.ts']);
    expect(rendering.browser).toEqual(['webgl', 'webgpu']);
    expect(rendering.unitProjects).toContain('rendering-perf');
    expect(rendering.allocation).toBe(true);
    expect(rendering.smoke).toBe(true);
    expect(selectLocalPolicy(['src/math/Matrix.ts']).browser).toEqual(['webgl', 'webgpu']);
  });

  it('uses package dependencies and special browser contracts', () => {
    const pathfinding = selectLocalPolicy(['packages/exojs-pathfinding/src/Grid.ts']);
    expect(pathfinding.packageTypechecks).toContain('@codexo/exojs-module-pathfinding');
    expect(pathfinding.gates).toContain('lint');
    expect(pathfinding.unitProjects).toContain('exojs-pathfinding');
    expect(pathfinding.browser).toEqual([]);
    expect(pathfinding.smoke).toBe(false);
    expect(pathfinding.needsDist).toBe(false);

    const particles = selectLocalPolicy(['packages/exojs-particles/src/ParticleSystem.ts']);
    expect(particles.browser).toEqual(['webgl', 'webgpu']);
    expect(particles.bench).toBe(true);

    const audio = selectLocalPolicy(['packages/exojs-audio-fx/src/AudioFx.ts']);
    expect(audio.browser).toEqual(['audio']);
    expect(audio.unitProjects).toContain('exojs-audio-fx');
  });

  it('keeps global and unknown paths broad', () => {
    for (const file of ['vitest.config.ts', 'scripts/ci/browser-profiles.ts', '.github/workflows/ci.yml', 'unexpected/new.kind']) {
      const policy = selectLocalPolicy([file]);
      expect(policy.gates).toEqual(orderGates(Object.values(GATE_GROUPS).flat()));
      expect(policy.fullUnit).toBe(true);
      expect(policy.browser).toContain('webgl');
      expect(policy.browser).toContain('webgpu');
      expect(policy.smoke).toBe(true);
    }
  });

  it('selects site and example contracts without renderer lanes', () => {
    const policy = selectLocalPolicy(['examples/basic/hello.ts']);
    expect(policy.gates).toContain('typecheck:examples');
    expect(policy.gates).toContain('examples:sync:check');
    expect(policy.browser).toEqual([]);
    expect(policy.smoke).toBe(true);
  });

  it('runs narrow local tests while CI retains the full affected matrix', () => {
    const input = lanesFor('src/input/gamepadMappings.ts');
    expect(input.map(lane => lane.id)).toEqual(['unit']);
    expect(input[0]?.run).toContain('--project=exojs');
    expect(input[0]?.run).not.toContain('test:alloc');
    expect(lanesFor('README.md')[0]?.run).toContain('test/site');
    expect(lanesFor('src/rendering/Renderer.ts').map(lane => lane.id)).toEqual(['unit', 'webgl', 'webgpu', 'bench', 'smoke']);
    expect(lanesFor('packages/exojs-pathfinding/src/Grid.ts').map(lane => lane.id)).toEqual(['unit']);
    expect(lanesFor('packages/exojs-audio-fx/src/AudioFx.ts').map(lane => lane.id)).toEqual(['unit', 'audio']);
    expect(lanesFor('vitest.config.ts').find(lane => lane.id === 'unit')?.run).toContain('pnpm test && pnpm test:alloc');
    expect(lanesFor('unexpected/new.kind').map(lane => lane.id)).toContain('webgpu');
  });

  it('brings dist up to date before the first lane only when a selected lane reads it', () => {
    const all = (file: string) => selectLocalLanes(effectiveLanes(selectAreas([file])), parseLocalLaneOptions([]), [file]);

    // The site gates and the example smoke read dist; a stale or missing build
    // would otherwise fail them after every lane ahead of them had run.
    expect(
      all('site/src/pages/index.astro')
        .filter(lane => lane.dist)
        .map(lane => lane.id),
    ).toEqual(['site', 'smoke']);
    expect(needsDist(all('src/rendering/Renderer.ts'))).toBe(true);
    expect(needsDist(all('README.md'))).toBe(false);
  });
});

describe('CI tooling scope', () => {
  const tooling = [
    'scripts/ci/gates.ts',
    'scripts/ci/local-policy.ts',
    'scripts/ci/select-lanes.ts',
    'scripts/lib/validation-lock.ts',
    'scripts/lanes.ts',
    'test/ci/local-policy.test.ts',
    '.husky/pre-push',
  ];

  it.each(tooling)('runs only the tooling checks for %s', file => {
    const policy = selectLocalPolicy([file]);

    expect(policy.fullUnit).toBe(false);
    expect(policy.browser).toEqual([]);
    expect(policy.smoke).toBe(false);
    expect(policy.bench).toBe(false);
    expect(policy.allocation).toBe(false);
    expect(policy.physicsPerf).toBe(false);
    expect(policy.needsDist).toBe(false);
    expect(policy.nodeTests).toBe(true);
    expect(policy.gates).toEqual(expect.arrayContaining(['typecheck:scripts', 'typecheck:test', 'lint', 'format:check']));
    expect(policy.gates).not.toContain('typecheck:site');
    expect(policy.unitFilter).toContain('test/ci');
  });

  it('runs the tooling tests for a hook change, which no CI area selects', () => {
    expect(lanesFor('.husky/pre-push').map(lane => lane.id)).toEqual(['unit']);
  });

  it('keeps the README example suite for the file that exports its path list', () => {
    expect(selectLocalPolicy(['scripts/ci/select-lanes.ts']).unitFilter).toBe('test/ci test/site/readme-examples');
    expect(selectLocalPolicy(['scripts/ci/gates.ts']).unitFilter).toBe('test/ci');
  });

  it('selects lanes without browser, bench or smoke work, and runs the supervisor tests', () => {
    const lanes = lanesFor('scripts/ci/gate-groups.ts');

    expect(lanes.map(lane => lane.id)).toEqual(['unit']);
    expect(lanes[0]?.run).toBe(
      'node --test test/ci/validation.node.ts test/ci/qualify.node.ts && pnpm exec vitest run --project=exojs test/ci',
    );
  });

  it.each([
    'scripts/ci/browser-profiles.ts',
    'scripts/ci/file-progress-reporter.ts',
    'scripts/ci/verify-esm-importmap.ts',
    'scripts/ci/bundle-size-summary.ts',
    'scripts/ci/brand-new-script.ts',
    'scripts/lib/output.ts',
    'scripts/lib/module-specifiers.ts',
    'scripts/build.ts',
    'vitest.config.ts',
    '.github/workflows/ci.yml',
    '.husky/unknown-hook',
    'package.json',
  ])('keeps %s on the broad selection', file => {
    const policy = selectLocalPolicy([file]);

    expect(policy.fullUnit).toBe(true);
    expect(policy.browser).toContain('webgpu');
    expect(isCiTooling(file)).toBe(false);
  });

  it('falls back to the broad selection for a tooling change mixed with an unknown file', () => {
    expect(selectLocalPolicy(['scripts/ci/gates.ts', 'unexpected/new.kind']).fullUnit).toBe(true);
  });

  it('adds engine checks when tooling is combined with an engine change, never dropping either', () => {
    const policy = selectLocalPolicy(['scripts/ci/gates.ts', 'src/rendering/Renderer.ts']);

    expect(policy.browser).toEqual(expect.arrayContaining(['webgl', 'webgpu']));
    expect(policy.unitFilter).toBeUndefined();
    expect(policy.nodeTests).toBe(true);
    expect(policy.gates).toEqual(expect.arrayContaining(['typecheck:scripts', 'typecheck', 'docs:api:check']));
  });

  it('does not weaken the selection of the other scopes', () => {
    expect(selectLocalPolicy(['src/rendering/Renderer.ts']).nodeTests).toBe(false);
    expect(selectLocalPolicy(['README.md']).unitFilter).toBe('test/site');
  });

  describe('importer proof', () => {
    const root = process.cwd();
    const skip = new Set(['node_modules', 'dist', '.git', '.workspace', '.worktrees', 'test-results', '.cache']);

    const sources = (dir: string): string[] =>
      readdirSync(dir).flatMap(name => {
        if (skip.has(name)) {
          return [];
        }

        const path = join(dir, name);

        try {
          if (statSync(path).isDirectory()) {
            return sources(path);
          }
        } catch {
          return [];
        }

        return /\.(ts|tsx|js|mjs|cjs|astro)$/.test(name) ? [path] : [];
      });

    const files = ['src', 'packages', 'site', 'examples', 'test', 'scripts'].flatMap(dir => sources(join(root, dir)));
    files.push(join(root, 'vitest.config.ts'));

    // `readme-examples` reads the README path list `select-lanes.ts` exports; the tooling scope runs it.
    const knownConsumers = new Map([['scripts/ci/select-lanes.ts', ['test/site/readme-examples.test.ts']]]);

    // Specifiers are resolved against the importing file, so an unrelated module that merely shares a basename does not count.
    const importSpecifier = /(?:from\s+|import\s*\(\s*|import\s+)['"]([^'"]+)['"]/g;

    const imports = (file: string): string[] => {
      const base = join(file, '..');

      let text: string;

      try {
        text = readFileSync(file, 'utf8');
      } catch {
        // Other test files create and remove scratch sources while this suite scans in parallel.
        return [];
      }

      return [...text.matchAll(importSpecifier)]
        .map(match => match[1]!)
        .filter(specifier => specifier.startsWith('.'))
        .map(specifier =>
          relative(root, join(base, specifier))
            .replaceAll('\\', '/')
            .replace(/\.(ts|js)$/, ''),
        );
    };

    it.each([...CI_TOOLING_FILES].filter(file => file.endsWith('.ts')))('%s is imported only by tooling and its own tests', tool => {
      const target = tool.replace(/\.ts$/, '');
      const importers = files
        .map(file => ({ file, path: relative(root, file).replaceAll('\\', '/') }))
        .filter(({ path }) => path !== tool && !isCiTooling(path))
        .filter(({ path }) => !(knownConsumers.get(tool) ?? []).includes(path))
        .filter(({ file }) => imports(file).includes(target))
        .map(({ path }) => path);

      expect(importers).toEqual([]);
    });
  });
});

describe('dependency-aware core tests', () => {
  const unitCommand = (...files: string[]): string =>
    selectLocalLanes(effectiveLanes(selectAreas(files)), parseLocalLaneOptions(['--base', 'origin/HEAD']), files).find(
      lane => lane.id === 'unit',
    )!.run;

  it('narrows the core project for an engine-only change, keeping tests that read untracked input', () => {
    const command = unitCommand('src/math/Vector.ts');

    expect(selectLocalPolicy(['src/math/Vector.ts']).relatedCore).toBe(true);
    expect(command).toContain('--project=exojs --passWithNoTests --changed=');
    expect(command).toContain('test/rendering/multi-attachment-guard.test.ts');
    expect(command).not.toMatch(/vitest run --project=exojs( |$)(?!--passWithNoTests)(?!test\/)/);
  });

  it('narrows a test-only change the same way', () => {
    expect(selectLocalPolicy(['test/math/vector.test.ts']).relatedCore).toBe(true);
  });

  it.each([
    ['a module that was removed', ['src/math/DefinitelyNotThere.ts']],
    ['a declaration file', ['src/globals.d.ts']],
    ['an engine change together with a site change', ['src/math/Vector.ts', 'site/src/lib/x.ts']],
    ['an engine change together with an example', ['src/math/Vector.ts', 'examples/basic/sprite.ts']],
    ['an engine change together with a root config', ['src/math/Vector.ts', 'vitest.config.ts']],
    ['an engine change together with an unknown file', ['src/math/Vector.ts', 'mystery.bin']],
    ['an engine change together with CI tooling', ['src/math/Vector.ts', 'scripts/ci/gates.ts']],
    ['a lockfile', ['pnpm-lock.yaml']],
  ])('keeps the whole core project for %s', (_name, files) => {
    expect(selectLocalPolicy(files).relatedCore).toBe(false);
  });

  it('keeps the other test projects whole while narrowing the core project', () => {
    const policy = selectLocalPolicy(['src/index.ts']);

    expect(policy.relatedCore).toBe(true);
    expect(policy.unitProjects).toContain('exojs-particles');
    expect(unitCommand('src/index.ts')).toMatch(/--project=exojs-particles/);
  });

  it('never narrows the full-unit fallback', () => {
    expect(selectLocalPolicy([]).relatedCore).toBe(false);
    expect(unitCommand('vitest.config.ts')).not.toContain('--changed');
  });
});
