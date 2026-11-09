import { buildRenderingComparison } from '../src/comparison/build';
import type { CellResult } from '../src/rendering/EngineAdapter';

const cell = (engine: string, frameTimeSource?: CellResult['frameTimeSource']): CellResult => ({
  spec: {
    engine,
    config: engine === 'exojs' ? 'current' : 'default',
    backend: 'webgl2',
    archetype: 'static-heavy',
    nodeCount: 1000,
    warmupFrames: 10,
    timedFrames: 60,
  },
  cpuMsMedian: 1,
  cpuMsP95: 1,
  frameMsMedian: 16.7,
  frameMsP95: 16.8,
  queueMsMedian: null,
  queueMsP95: null,
  structural: { drawCalls: 1, textureBinds: 1, bufferUploads: 1 },
  clock: { resolutionMs: 0.001, crossOriginIsolated: true },
  status: 'ok',
  ...(frameTimeSource !== undefined && { frameTimeSource }),
});

test.each([undefined, 'raf-cadence', 'unavailable'] as const)('comparison does not publish %s frame duration as GPU execution', source => {
  const [block] = buildRenderingComparison([cell('exojs', source), cell('pixi', 'webgl2-time-elapsed')]);
  const row = block!.sections.flatMap(section => section.rows).find(entry => entry.archetype === 'static-heavy')!;
  expect(row.cells[0]?.referenceGpuMs).toBeNull();
  expect(row.cells[0]?.competitorGpuMs).toBe(16.7);
});
