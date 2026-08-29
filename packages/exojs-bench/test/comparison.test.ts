import { buildPhysicsComparison, buildRenderingComparison, chooseHeadlineNodeCount } from '../src/comparison/build';
import { physicsMechanism, renderingMechanism } from '../src/comparison/mechanism';
import { renderComparison } from '../src/comparison/render';
import { compareMedians, NOISE_HIGH, NOISE_LOW, STRUCTURAL_FACTOR } from '../src/comparison/verdict';
import type { PhysicsCellResult } from '../src/physics/PhysicsAdapter';
import type { ArchetypeId, Backend, CellResult } from '../src/rendering/EngineAdapter';

/** A measured rendering cell, with everything the comparison does not read left at a neutral value. */
const cell = (options: {
  engine: string;
  config?: string;
  archetype: ArchetypeId;
  nodeCount: number;
  cpuMsMedian: number;
  backend?: Backend;
  drawCalls?: number;
  textureBinds?: number;
  bufferUploads?: number;
  status?: 'ok' | 'exceeded' | 'unavailable';
}): CellResult => ({
  spec: {
    engine: options.engine,
    config: options.config ?? 'current',
    backend: options.backend ?? 'webgl2',
    archetype: options.archetype,
    nodeCount: options.nodeCount,
    timedFrames: 60,
    warmupFrames: 10,
  },
  cpuMsMedian: options.cpuMsMedian,
  cpuMsP95: options.cpuMsMedian * 1.2,
  frameMsMedian: null,
  frameMsP95: null,
  queueMsMedian: null,
  queueMsP95: null,
  structural: { drawCalls: options.drawCalls ?? 1, textureBinds: options.textureBinds ?? 1, bufferUploads: options.bufferUploads ?? 1 },
  status: options.status ?? 'ok',
});

/** A measured physics cell. */
const physicsCell = (options: {
  engine: string;
  archetype: PhysicsCellResult['spec']['archetype'];
  bodyCount: number;
  stepMsMedian: number;
  contactCount?: number;
  rayHits?: number;
}): PhysicsCellResult => ({
  spec: { engine: options.engine, config: 'default', archetype: options.archetype, bodyCount: options.bodyCount, warmupSteps: 10, timedSteps: 60 },
  stepMsMedian: options.stepMsMedian,
  stepMsP95: options.stepMsMedian * 1.2,
  structural: { bodyCount: 100, contactCount: options.contactCount ?? 50, jointCount: 0, rayHits: options.rayHits ?? 0 },
  status: 'ok',
});

describe('compareMedians', () => {
  test('calls the noise band level, at both of its edges', () => {
    expect(compareMedians(NOISE_LOW, 1).side).toBe('neither');
    expect(compareMedians(NOISE_LOW, 1).label).toBe('level');
    expect(compareMedians(NOISE_HIGH, 1).side).toBe('neither');
  });

  test('just outside the band, the faster arm leads', () => {
    const below = compareMedians(NOISE_LOW - 0.001, 1);
    const above = compareMedians(NOISE_HIGH + 0.001, 1);

    expect(below.side).toBe('exojs');
    expect(below.structural).toBe(false);
    expect(above.side).toBe('competitor');
    expect(above.structural).toBe(false);
  });

  test('at the structural factor the lead is called clearly, and just below it is not', () => {
    expect(compareMedians(1, STRUCTURAL_FACTOR).structural).toBe(true);
    expect(compareMedians(1, STRUCTURAL_FACTOR).label).toContain('leads clearly');
    expect(compareMedians(1, STRUCTURAL_FACTOR - 0.01).structural).toBe(false);
    expect(compareMedians(1, STRUCTURAL_FACTOR - 0.01).label).toContain('leads');
  });

  test('the factor is the leader s advantage, whichever arm leads', () => {
    expect(compareMedians(1, 4).factor).toBeCloseTo(4, 10);
    expect(compareMedians(4, 1).factor).toBeCloseTo(4, 10);
  });

  test('a zero or non-finite median is not a win', () => {
    expect(compareMedians(0, 1).side).toBe('neither');
    expect(compareMedians(1, 0).label).toBe('not comparable');
    expect(compareMedians(Number.NaN, 1).label).toBe('not comparable');
  });
});

describe('chooseHeadlineNodeCount', () => {
  test('takes the largest count shared by every ladder', () => {
    expect(
      chooseHeadlineNodeCount(
        [
          [1_000, 5_000, 25_000],
          [200, 1_000, 5_000],
        ],
        () => true,
      ),
    ).toBe(5_000);
  });

  test('lowers the choice when the larger candidate has no valid cell', () => {
    expect(
      chooseHeadlineNodeCount(
        [
          [1_000, 5_000, 25_000],
          [1_000, 5_000, 25_000],
        ],
        count => count <= 5_000,
      ),
    ).toBe(5_000);
  });

  test('returns null when the ladders share nothing', () => {
    expect(chooseHeadlineNodeCount([[1_000], [2_000]], () => true)).toBeNull();
  });

  test('returns null when no candidate has a valid cell', () => {
    expect(chooseHeadlineNodeCount([[1_000, 5_000]], () => false)).toBeNull();
  });
});

describe('renderingMechanism', () => {
  test('attributes a draw-call gap when the counters differ by half again', () => {
    const mechanism = renderingMechanism({ drawCalls: 10, textureBinds: 5, bufferUploads: 5 }, { drawCalls: 100, textureBinds: 5, bufferUploads: 5 });

    expect(mechanism).toContain('ExoJS issues fewer draw calls (10 vs 100 per frame)');
  });

  test('refuses to attribute a noise-sized counter difference, however large the ratio', () => {
    // 3 vs 2 draw calls cannot account for a millisecond of CPU time on either
    // arm; offering it as the mechanism would be a coincidence that passed a
    // ratio test.
    expect(renderingMechanism({ drawCalls: 3, textureBinds: 1, bufferUploads: 0 }, { drawCalls: 2, textureBinds: 1, bufferUploads: 1 })).toContain(
      'the difference is CPU-side',
    );
  });

  test('names the competitor when it is the one issuing fewer', () => {
    expect(renderingMechanism({ drawCalls: 100, textureBinds: 1, bufferUploads: 1 }, { drawCalls: 10, textureBinds: 1, bufferUploads: 1 })).toContain(
      'competitor issues fewer draw calls',
    );
  });

  test('reports identical structure as a CPU-side difference rather than inventing a cause', () => {
    expect(renderingMechanism({ drawCalls: 8, textureBinds: 3, bufferUploads: 2 }, { drawCalls: 8, textureBinds: 3, bufferUploads: 2 })).toContain(
      'the difference is CPU-side',
    );
  });

  test('yields no mechanism when an arm reported no counters', () => {
    expect(renderingMechanism(null, { drawCalls: 8, textureBinds: 1, bufferUploads: 1 })).toBeNull();
    expect(renderingMechanism({ drawCalls: 0, textureBinds: 0, bufferUploads: 0 }, { drawCalls: 0, textureBinds: 0, bufferUploads: 0 })).toBeNull();
  });
});

describe('physicsMechanism', () => {
  test('reports the ray-hit counts when the archetype casts rays', () => {
    const mechanism = physicsMechanism(
      { bodyCount: 100, contactCount: 50, jointCount: 0, rayHits: 50 },
      { bodyCount: 100, contactCount: 50, jointCount: 0, rayHits: 51 },
    );

    expect(mechanism).toContain('50 vs 51 ray hits per step');
  });

  test('attributes a contact-count gap and states that the counters are not identical across arms', () => {
    const mechanism = physicsMechanism(
      { bodyCount: 100, contactCount: 20, jointCount: 0, rayHits: 0 },
      { bodyCount: 100, contactCount: 200, jointCount: 0, rayHits: 0 },
    );

    expect(mechanism).toContain('ExoJS resolves fewer solved contacts (20 vs 200)');
    expect(mechanism).toContain('not semantically identical');
  });
});

describe('buildRenderingComparison', () => {
  /** A fixture matrix: two arms over two archetypes at two counts, all valid. */
  const fixture = (): CellResult[] => [
    cell({ engine: 'exojs', archetype: 'static-heavy', nodeCount: 1_000, cpuMsMedian: 1 }),
    cell({ engine: 'exojs', archetype: 'static-heavy', nodeCount: 5_000, cpuMsMedian: 4 }),
    cell({ engine: 'pixi', config: 'default', archetype: 'static-heavy', nodeCount: 1_000, cpuMsMedian: 2 }),
    cell({ engine: 'pixi', config: 'default', archetype: 'static-heavy', nodeCount: 5_000, cpuMsMedian: 40, drawCalls: 50 }),
    cell({ engine: 'exojs', archetype: 'text-static', nodeCount: 1_000, cpuMsMedian: 3 }),
    cell({ engine: 'exojs', archetype: 'text-static', nodeCount: 5_000, cpuMsMedian: 12 }),
    cell({ engine: 'pixi', config: 'default', archetype: 'text-static', nodeCount: 1_000, cpuMsMedian: 3.1 }),
    cell({ engine: 'pixi', config: 'default', archetype: 'text-static', nodeCount: 5_000, cpuMsMedian: 12.2 }),
  ];

  test('publishes one block per backend measured', () => {
    const blocks = buildRenderingComparison(fixture());

    expect(blocks.map(block => block.backend)).toEqual(['webgl2']);
  });

  test('picks one count for the whole table and applies it to every row', () => {
    const [block] = buildRenderingComparison(fixture());
    const counts = new Set(block!.sections.flatMap(section => section.rows.map(row => row.count)));

    expect(block!.headlineCount).toBe(5_000);
    expect([...counts]).toEqual([5_000]);
  });

  test('computes each verdict from the two medians', () => {
    const [block] = buildRenderingComparison(fixture());
    const rows = block!.sections.flatMap(section => section.rows);
    const scaling = rows.find(row => row.archetype === 'static-heavy')!;
    const text = rows.find(row => row.archetype === 'text-static')!;

    expect(scaling.cells[0]!.verdict.side).toBe('exojs');
    expect(scaling.cells[0]!.verdict.structural).toBe(true);
    expect(text.cells[0]!.verdict.side).toBe('neither');
  });

  test('files rows under category sections and never emits a category row', () => {
    const [block] = buildRenderingComparison(fixture());

    expect(block!.sections.map(section => section.title)).toEqual(['Node scaling', 'Text']);

    for (const section of block!.sections) {
      expect(section.rows.every(row => row.archetype !== section.title)).toBe(true);
    }
  });

  test('excludes the ExoJS-internal probes, with a stated reason', () => {
    const [block] = buildRenderingComparison(fixture());
    const excluded = block!.excluded.map(entry => entry.archetype);

    expect(excluded).toContain('split-screen');
    expect(excluded).toContain('instanced-batch');
    expect(block!.excluded.every(entry => entry.reason.length > 0)).toBe(true);
  });

  test('keeps a WebGL1 arm out of the main columns and in its own block', () => {
    const results = [
      ...fixture(),
      cell({
        engine: 'phaser',
        config: 'default',
        archetype: 'static-heavy',
        nodeCount: 5_000,
        cpuMsMedian: 30,
        drawCalls: 0,
        textureBinds: 0,
        bufferUploads: 0,
      }),
      cell({
        engine: 'phaser',
        config: 'default',
        archetype: 'static-heavy',
        nodeCount: 1_000,
        cpuMsMedian: 6,
        drawCalls: 0,
        textureBinds: 0,
        bufferUploads: 0,
      }),
    ];
    const [block] = buildRenderingComparison(results);

    expect(block!.competitors).not.toContain('phaser');
    expect(block!.webgl1.map(row => row.archetype)).toContain('static-heavy');
    expect(block!.webgl1.every(row => row.cells.every(entry => entry.mechanism === null))).toBe(true);
  });

  test('a count some arm failed to measure is not chosen', () => {
    const results = fixture().map(result =>
      result.spec.engine === 'pixi' && result.spec.nodeCount === 5_000 ? { ...result, status: 'exceeded' as const } : result,
    );
    const [block] = buildRenderingComparison(results);

    expect(block!.headlineCount).toBe(1_000);
  });
});

describe('buildPhysicsComparison', () => {
  test('publishes a row per archetype at one shared body count', () => {
    const results = [200, 1_000, 4_000].flatMap(bodyCount => [
      physicsCell({ engine: 'exojs-physics', archetype: 'box-stack', bodyCount, stepMsMedian: 1 }),
      physicsCell({ engine: 'matter-js', archetype: 'box-stack', bodyCount, stepMsMedian: 3, contactCount: 50 }),
    ]);
    const section = buildPhysicsComparison(results);

    expect(section.rows).toHaveLength(1);
    expect(section.rows[0]!.count).toBe(4_000);
    expect(section.rows[0]!.cells[0]!.verdict.side).toBe('exojs');
  });
});

describe('renderComparison', () => {
  test('states the ladder, the count and the omissions in the document itself', () => {
    const blocks = buildRenderingComparison([
      cell({ engine: 'exojs', archetype: 'static-heavy', nodeCount: 1_000, cpuMsMedian: 1 }),
      cell({ engine: 'pixi', config: 'default', archetype: 'static-heavy', nodeCount: 1_000, cpuMsMedian: 2, drawCalls: 40 }),
    ]);
    const document = renderComparison({
      rendering: {
        provenance: [
          {
            adapter: 'Test GPU',
            backend: 'webgl2',
            flags: ['--force-device-scale-factor=1'],
            headless: true,
            software: false,
            engineVersion: '0.15.2',
            timestamp: '2026-08-29T00:00:00.000Z',
          },
        ],
        libraries: [{ name: 'pixi.js', version: '8.19.0', resolvedFrom: '' }],
        backends: blocks,
      },
    });

    expect(document).toContain('Test GPU');
    expect(document).toContain('software rasterizer `false`');
    expect(document).toContain('1000 nodes');
    expect(document).toContain('leads');
    expect(document).toContain('Omissions');
  });

  test('marks a software-rasterizer run as not reportable', () => {
    const document = renderComparison({
      rendering: {
        provenance: [
          {
            adapter: 'SwiftShader',
            backend: 'webgl2',
            flags: [],
            headless: true,
            software: true,
            engineVersion: '0.15.2',
            timestamp: '2026-08-29T00:00:00.000Z',
          },
        ],
        libraries: [],
        backends: [],
      },
    });

    expect(document).toContain('not reportable');
  });
});
