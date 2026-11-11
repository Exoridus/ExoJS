import { describe, expect, test } from 'vitest';

import { COMPETITIVE_GAPS, COMPETITIVE_SCENARIOS, selectCompetitiveScenarios } from '../src/competitive/catalog';
import { ARCHETYPES, buildMatrix } from '../src/rendering/archetypes';
import { phaserCovers } from '../src/rendering/coverage';
import type { ArchetypeSpec, EngineAdapter } from '../src/rendering/EngineAdapter';
import { selectMutationIndices } from '../src/shared/mutation';

const DIRTY_IDS = ['dirty-0', 'dirty-1', 'dirty-10', 'dirty-25', 'dirty-50', 'dirty-75', 'dirty-100'];

describe('competitive dirty-rate workloads', () => {
  test('builds seven rates over the same flat scene and load ladder', () => {
    const rows = ARCHETYPES.filter(spec => DIRTY_IDS.includes(spec.id));

    expect(rows.map(spec => spec.id)).toEqual(DIRTY_IDS);
    expect(rows.map(spec => spec.mutationFraction)).toEqual([0, 0.01, 0.1, 0.25, 0.5, 0.75, 1]);

    for (const row of rows) {
      const { id: _id, mutationFraction: _fraction, ...scene } = row;

      expect(scene).toEqual({
        category: 'node-scaling',
        crossArm: true,
        nodeCounts: [1_000, 10_000, 25_000],
        nestingDepth: 1,
        textureCount: 1,
        cullingEnabled: false,
      });
    }
  });

  test('keeps each lower-rate selection inside the next rate for the same scene', () => {
    const rows = ARCHETYPES.filter(spec => DIRTY_IDS.includes(spec.id));

    expect(rows).toHaveLength(7);

    for (const count of [1_000, 10_000, 25_000]) {
      let previous: readonly number[] = [];

      for (const row of rows) {
        const selected = selectMutationIndices(count, row.mutationFraction, 0xc0ffee);
        const selectedSet = new Set(selected);

        expect(previous.every(index => selectedSet.has(index))).toBe(true);
        previous = selected;
      }

      expect(previous).toHaveLength(count);
    }
  });
});

describe('Phaser comparative coverage', () => {
  test('excludes blend-state workloads the adapter does not implement', () => {
    const spec = ARCHETYPES.find(row => row.id === 'mixed-blend')!;

    expect(phaserCovers(spec)).toBe(false);
    // Capability follows the workload, so renaming a scene cannot admit it.
    expect(phaserCovers({ ...spec, id: 'static-heavy' })).toBe(false);
    expect(phaserCovers({ ...spec, blendModeCount: 1 })).toBe(true);
  });

  test('does not emit a measured Phaser cell for unsupported blend modes', () => {
    const phaser: EngineAdapter = {
      engine: 'phaser',
      config: 'webgl2',
      supports: backend => backend === 'webgl2',
      coversArchetype: (spec: ArchetypeSpec) => phaserCovers(spec),
      init: async () => undefined,
      buildScene: () => undefined,
      mutate: () => undefined,
      renderFrame: () => undefined,
      teardown: () => undefined,
    };
    const cells = buildMatrix([phaser], ['webgl2', 'webgpu']);

    expect(cells.some(cell => cell.archetype === 'mixed-blend')).toBe(false);
    expect(cells.filter(cell => DIRTY_IDS.includes(cell.archetype))).toHaveLength(21);
    expect(cells.every(cell => cell.backend === 'webgl2')).toBe(true);
  });
});

describe('competitive catalog selection', () => {
  test('expands a benchmark group into the complete dirty-rate comparison', () => {
    expect(selectCompetitiveScenarios(['B03']).map(scenario => scenario.archetype)).toEqual(DIRTY_IDS);
  });

  test('deduplicates overlapping group and scene selectors without changing catalog order', () => {
    const selected = selectCompetitiveScenarios(['dirty-50', 'B03', 'dirty-1', 'B03']);

    expect(selected.map(scenario => scenario.id)).toEqual(DIRTY_IDS);
  });

  test('rejects unknown selectors instead of silently measuring fewer scenes', () => {
    expect(() => selectCompetitiveScenarios(['B03', 'dritty-10'])).toThrow(/dritty-10/);
  });

  test.each(['B07', 'B09', 'B13'])('reports %s as a gap rather than substituting a cheaper scene', group => {
    expect(() => selectCompetitiveScenarios([group])).toThrow(/not implemented/i);
    expect(COMPETITIVE_GAPS.some(gap => gap.group === group)).toBe(true);
  });

  test('selects all declared scenes when no filter was requested', () => {
    expect(selectCompetitiveScenarios()).toEqual(COMPETITIVE_SCENARIOS);
    expect(selectCompetitiveScenarios([])).toEqual(COMPETITIVE_SCENARIOS);
  });
});

describe('competitive catalog capability contract', () => {
  test('declares more than ten real cross-arm workloads with concrete loads', () => {
    expect(COMPETITIVE_SCENARIOS.length).toBeGreaterThan(10);
    expect(new Set(COMPETITIVE_SCENARIOS.map(scenario => scenario.id)).size).toBe(COMPETITIVE_SCENARIOS.length);

    for (const scenario of COMPETITIVE_SCENARIOS) {
      const spec = ARCHETYPES.find(row => row.id === scenario.archetype);

      expect(spec?.crossArm).toBe(true);
      expect(scenario.id).toBe(scenario.archetype);
      expect(scenario.loads.length).toBeGreaterThan(0);
      expect(scenario.loads.every(load => Number.isSafeInteger(load) && load > 0)).toBe(true);
      expect(scenario.workload.length).toBeGreaterThan(0);
    }
  });

  test('limits Phaser to its actual backend and excludes its unimplemented blend path', () => {
    const blend = COMPETITIVE_SCENARIOS.find(scenario => scenario.archetype === 'mixed-blend')!;
    const layers = COMPETITIVE_SCENARIOS.find(scenario => scenario.archetype === 'fill-layers')!;

    expect(blend?.support).toEqual({ exojs: ['webgl2', 'webgpu'], pixi: ['webgl2', 'webgpu'], phaser: [] });
    expect(layers?.support.phaser).toEqual(['webgl2']);

    for (const scenario of COMPETITIVE_SCENARIOS) {
      expect(scenario.support.phaser).not.toContain('webgpu');
    }
  });

  test('keeps sprite-camera culling separate from the supported dedicated tile paths', () => {
    const scrolling = COMPETITIVE_SCENARIOS.find(scenario => scenario.archetype === 'scrolling-world')!;
    const tiles = COMPETITIVE_SCENARIOS.filter(scenario => scenario.group === 'B08' && scenario.unit === 'tiles');

    expect(scrolling?.support.phaser).toEqual([]);
    expect(tiles.map(scenario => scenario.archetype)).toEqual(['tilemap-scroll', 'tilemap-edit']);
    expect(tiles.every(scenario => scenario.support.phaser.includes('webgl2'))).toBe(true);
  });

  test('does not advertise probabilistic emitter simulation as deterministic particle replay', () => {
    expect(selectCompetitiveScenarios(['B11']).map(scenario => scenario.archetype)).toEqual(['particles-draw']);
    expect(COMPETITIVE_GAPS.some(gap => gap.group === 'B11')).toBe(true);
  });
});
