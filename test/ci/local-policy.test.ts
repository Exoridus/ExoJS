import { describe, expect, it } from 'vitest';

import { GATE_GROUPS } from '../../scripts/ci/gate-groups.ts';
import { parseLocalLaneOptions, selectLocalLanes } from '../../scripts/ci/local-lanes.ts';
import { selectLocalPolicy } from '../../scripts/ci/local-policy.ts';
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
    expect(pathfinding.packageTypechecks).toContain('@codexo/exojs-pathfinding');
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
    for (const file of ['vitest.config.ts', 'scripts/ci/lanes.ts', '.github/workflows/ci.yml', 'unexpected/new.kind']) {
      const policy = selectLocalPolicy([file]);
      expect(policy.gates).toEqual(Object.values(GATE_GROUPS).flat());
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
});
