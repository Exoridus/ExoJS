import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

import { GATE_GROUPS, orderGates } from '../../scripts/ci/gate-groups.ts';
import { LANES } from '../../scripts/ci/lanes.ts';
import { needsDist, parseLocalLaneOptions, selectLocalLanes } from '../../scripts/ci/local-lanes.ts';
import { CI_TOOLING_FILES, isCiTooling, selectLocalPolicy } from '../../scripts/ci/local-policy.ts';
import { effectiveLanes, selectAreas } from '../../scripts/ci/select-lanes.ts';

const lanesFor = (file: string) => {
  const options = parseLocalLaneOptions(['--tests-only']);

  return selectLocalLanes(effectiveLanes(selectAreas([file])), options, [file]);
};

describe('local validation policy', () => {
  it.each(['src/rendering/sprite/Sprite.ts', 'src/rendering/sprite/AnimatedSprite.ts'])(
    'defers browser, benchmark and smoke lanes only in pre-push mode for %s',
    file => {
      const effective = effectiveLanes(selectAreas([file]));
      const options = { ...parseLocalLaneOptions(['--tests-only', '--base', 'HEAD']), prePush: true };
      const selected = selectLocalLanes(effective, options, [file]);

      expect(selected.map(lane => lane.id)).toEqual(['unit']);
      expect(selected[0]!.run).toContain('affected-plan.ts --run');
      expect(selected[0]!.run).toContain('pnpm test:alloc');
      expect(selected[0]!.run).not.toContain('--full');
      expect(needsDist(selected)).toBe(true);
      expect(selectLocalPolicy([file]).gates).toContain('docs:api:check');
    },
  );

  it('keeps the full manual lane selection when pre-push mode is absent', () => {
    const file = 'src/rendering/sprite/AnimatedSprite.ts';
    const selected = selectLocalLanes(effectiveLanes(selectAreas([file])), parseLocalLaneOptions(['--tests-only', '--base', 'HEAD']), [
      file,
    ]);

    expect(selected.map(lane => lane.id)).toEqual(['unit', 'webgl', 'webgpu', 'bench', 'smoke']);
  });

  it.each(['vitest.config.ts', 'unexpected/new.kind', 'src/rendering/DefinitelyDeleted.ts', 'packages/exojs-build/src/shaderPlugin.ts'])(
    'retains broad pre-push validation for uncertain input %s',
    file => {
      const options = { ...parseLocalLaneOptions(['--tests-only', '--base', 'HEAD']), prePush: true };
      const selected = selectLocalLanes(effectiveLanes(selectAreas([file])), options, [file]);

      expect(selected.map(lane => lane.id)).toEqual(expect.arrayContaining(['unit', 'webgl', 'webgpu', 'smoke']));
      expect(selected.find(lane => lane.id === 'unit')!.run).toContain('--full');
    },
  );

  it.each([['--all'], ['--base', 'missing-pre-push-base']].map(flags => ({ flags })))(
    'does not defer lanes for an explicit full or unresolved range $flags',
    ({ flags }) => {
      const file = 'src/rendering/sprite/Sprite.ts';
      const options = { ...parseLocalLaneOptions(['--tests-only', ...flags]), prePush: true };
      const selected = selectLocalLanes(effectiveLanes(selectAreas([file])), options, [file]);

      expect(selected.map(lane => lane.id)).toEqual(expect.arrayContaining(['unit', 'webgl', 'webgpu', 'bench', 'smoke']));
      expect(selected.find(lane => lane.id === 'unit')!.run).toContain('--full');
    },
  );

  it('retains physics qualification in pre-push mode', () => {
    const file = 'packages/exojs-physics/src/PhysicsWorld.ts';
    const options = { ...parseLocalLaneOptions(['--tests-only', '--base', 'HEAD']), prePush: true };
    const selected = selectLocalLanes(effectiveLanes(selectAreas([file])), options, [file]);

    expect(selected.find(lane => lane.id === 'unit')!.run).toContain('pnpm test:physics-perf');
  });

  it('accepts the explicit pre-push mode while keeping diagnostics separate', () => {
    expect(() => parseLocalLaneOptions(['--pre-push', '--tests-only', '--base', 'HEAD'])).not.toThrow();
    expect(() => parseLocalLaneOptions(['--pre-push', '--only=unit'])).toThrow(/cannot combine/);
    expect(() => parseLocalLaneOptions(['--pre-push', '--quick'])).toThrow(/cannot combine/);
  });

  it('uses one graph selection for the normal workspace unit inventory', () => {
    const lanes = lanesFor('src/math/Vector.ts');
    const command = lanes.find(lane => lane.id === 'unit')!.run;

    expect(command.match(/affected-plan\.ts/g)).toHaveLength(1);
    expect(command).toContain('--run');
    expect(command).toContain('--project="exojs*"');
    expect(command).toContain('--project="rendering-perf"');
    expect(command).not.toContain('--changed');
    expect(command).not.toContain('test/rendering/multi-attachment-guard.test.ts');
  });

  it('preserves separate ordered browser invocations and WebGPU serial execution', () => {
    const lanes = lanesFor('src/rendering/sprite/Sprite.ts');
    const webgl = lanes.find(lane => lane.id === 'webgl')!.run;
    const webgpu = lanes.find(lane => lane.id === 'webgpu')!.run;

    expect(webgl.match(/affected-plan\.ts/g)).toHaveLength(4);
    expect([...webgl.matchAll(/--project="([^"]+)"/g)].map(match => match[1])).toEqual([
      'browser-webgl-chromium',
      'browser-build-chromium',
      'browser-assets-chromium',
      'browser-core-chromium',
    ]);
    expect(webgpu.match(/affected-plan\.ts/g)).toHaveLength(2);
    expect(webgpu.split(' && ')[0]).toContain('--no-file-parallelism');
    expect(webgpu.split(' && ')[1]).toContain('--project="browser-webgpu-media"');
    expect(lanes.find(lane => lane.id === 'unit')!.run).toContain('pnpm test:alloc');
  });

  it('keeps package consumers in the graph inventory and physics qualification separate', () => {
    const command = lanesFor('packages/exojs-physics/src/PhysicsWorld.ts').find(lane => lane.id === 'unit')!.run;

    expect(command).toContain('--project="exojs*"');
    expect(command).toContain('--project="rendering-perf"');
    expect(command.match(/affected-plan\.ts/g)).toHaveLength(1);
    expect(command).toContain('pnpm test:physics-perf');
  });

  it('keeps explicit diagnostic lane commands unchanged', () => {
    const selected = selectLocalLanes(effectiveLanes(selectAreas([])), parseLocalLaneOptions(['--only', 'unit,webgpu']));

    expect(selected.map(lane => lane.run)).toEqual(['unit', 'webgpu'].map(id => LANES.find(lane => lane.id === id)!.run));
  });

  it.each(['vitest.config.ts', 'unexpected/new.kind', 'src/math/DefinitelyNotThere.ts', 'packages/exojs-build/src/shaderPlugin.ts'])(
    'executes full graph inventories for %s',
    file => {
      const lanes = lanesFor(file);

      for (const lane of lanes.filter(
        candidate => candidate.id === 'unit' || ['webgl', 'webgpu', 'audio', 'tilemap'].includes(candidate.id),
      )) {
        expect(lane.run).toContain('affected-plan.ts');
        expect(lane.run).toContain('--full');
      }
    },
  );

  it('keeps --all full and quick mode diagnostic without browser work', () => {
    const effective = effectiveLanes(selectAreas(['src/rendering/sprite/Sprite.ts']));
    const all = selectLocalLanes(effective, parseLocalLaneOptions(['--all']), ['src/rendering/sprite/Sprite.ts']);
    const quick = selectLocalLanes(effective, parseLocalLaneOptions(['--quick']), ['src/rendering/sprite/Sprite.ts']);

    expect(all.find(lane => lane.id === 'unit')!.run).toContain('--full');
    expect(quick.every(lane => lane.local !== 'browser')).toBe(true);
    expect(quick.find(lane => lane.id === 'unit')!.run).toContain('affected-plan.ts');
  });

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
      expect(policy.unitProjects).toEqual(['exojs*', 'rendering-perf']);
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
    expect(pathfinding.unitProjects).toContain('exojs*');
    expect(pathfinding.browser).toEqual([]);
    expect(pathfinding.smoke).toBe(false);
    expect(pathfinding.needsDist).toBe(false);

    const particles = selectLocalPolicy(['packages/exojs-particles/src/ParticleSystem.ts']);
    expect(particles.browser).toEqual(['webgl', 'webgpu']);
    expect(particles.bench).toBe(true);

    const audio = selectLocalPolicy(['packages/exojs-audio-fx/src/AudioFx.ts']);
    expect(audio.browser).toEqual(['audio']);
    expect(audio.unitProjects).toContain('exojs*');
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
    expect(input[0]?.run).toContain('--project="exojs*"');
    expect(input[0]?.run).not.toContain('test:alloc');
    expect(lanesFor('README.md')[0]?.run).toContain('test/site');
    expect(lanesFor('src/rendering/Renderer.ts').map(lane => lane.id)).toEqual(['unit', 'webgl', 'webgpu', 'bench', 'smoke']);
    expect(lanesFor('packages/exojs-pathfinding/src/Grid.ts').map(lane => lane.id)).toEqual(['unit']);
    expect(lanesFor('packages/exojs-audio-fx/src/AudioFx.ts').map(lane => lane.id)).toEqual(['unit', 'audio']);
    expect(lanesFor('vitest.config.ts').find(lane => lane.id === 'unit')?.run).toContain('--full');
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

describe('dependency-aware workspace tests', () => {
  const unitCommand = (...files: string[]): string =>
    selectLocalLanes(effectiveLanes(selectAreas(files)), parseLocalLaneOptions(['--base', 'HEAD']), files).find(lane => lane.id === 'unit')!
      .run;

  it('narrows the core project for an engine-only change, keeping tests that read untracked input', () => {
    const command = unitCommand('src/math/Vector.ts');

    expect(selectLocalPolicy(['src/math/Vector.ts']).relatedTests).toBe(true);
    expect(command).toContain('--project="exojs*"');
    expect(command.match(/affected-plan\.ts/g)).toHaveLength(1);
    expect(command).not.toContain('--changed');
  });

  it('narrows a test-only change the same way', () => {
    expect(selectLocalPolicy(['test/math/vector.test.ts']).relatedTests).toBe(true);
  });

  it('keeps graph selection when an engine change also updates documentation', () => {
    const files = ['src/rendering/sprite/Sprite.ts', 'docs/architecture.md'];

    expect(selectLocalPolicy(files).relatedTests).toBe(true);
    expect(unitCommand(...files)).toContain('affected-plan.ts');
    expect(selectLocalPolicy(files).gates).toContain('format:check');
  });

  it.each(['scripts/ci/VALIDATION.md', '.github/workflows/README.md'])(
    'keeps infrastructure documentation %s with the ordinary graph inputs',
    documentation => {
      const files = ['src/rendering/sprite/AnimatedSprite.ts', documentation];
      const policy = selectLocalPolicy(files);

      expect(policy.relatedTests).toBe(true);
      expect(policy.fullUnit).toBe(false);
      expect(policy.gates).toContain('format:check');
      expect(unitCommand(...files)).not.toContain('--full');
    },
  );

  it.each(['README.md', 'site/src/content/guide/sprites.mdx'])(
    'adds the content tests for %s without widening the engine tests',
    documentation => {
      const files = ['src/rendering/sprite/Sprite.ts', documentation];

      expect(selectLocalPolicy(files).relatedTests).toBe(true);
      expect(unitCommand(...files)).toContain('affected-plan.ts');
      expect(unitCommand(...files)).not.toContain('test/site');
    },
  );

  it('does not rewrite an unknown path into a recognized documentation file', () => {
    expect(selectLocalPolicy([' README.md ']).fullUnit).toBe(true);
  });

  it.each([
    ['a module that was removed', ['src/math/DefinitelyNotThere.ts']],
    ['a declaration file', ['src/globals.d.ts']],
    ['an engine change together with a site change', ['src/math/Vector.ts', 'site/src/lib/x.ts']],
    ['an engine change together with an example', ['src/math/Vector.ts', 'examples/basic/sprite.ts']],
    ['an engine change together with a root config', ['src/math/Vector.ts', 'vitest.config.ts']],
    ['an engine change together with an unknown file', ['src/math/Vector.ts', 'mystery.bin']],
    ['an engine change together with CI tooling', ['src/math/Vector.ts', 'scripts/ci/gates.ts']],
    ['generated infrastructure content', ['src/math/Vector.ts', 'scripts/ci/generated/template.md']],
    ['a lockfile', ['pnpm-lock.yaml']],
  ])('keeps the whole core project for %s', (_name, files) => {
    expect(selectLocalPolicy(files).relatedTests).toBe(false);
  });

  it('finds consumers in every normal workspace unit project', () => {
    const policy = selectLocalPolicy(['src/index.ts']);

    expect(policy.relatedTests).toBe(true);
    expect(policy.unitProjects).toContain('exojs*');
    expect(unitCommand('src/index.ts')).toContain('--project="exojs*"');
  });

  it('never narrows the full-unit fallback', () => {
    expect(selectLocalPolicy([]).relatedTests).toBe(false);
    expect(unitCommand('vitest.config.ts')).not.toContain('--changed');
  });
});
