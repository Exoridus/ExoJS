import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import type { CellResult, CellSpec } from '../src/rendering/EngineAdapter';

const resources = vi.hoisted(() => ({ launch: vi.fn(), start: vi.fn() }));
vi.mock('playwright', () => ({ chromium: { launch: resources.launch }, webkit: { launch: resources.launch } }));
vi.mock('../src/shared/viteServer', () => ({
  RENDERING_LIBRARY_ARMS: [],
  readEngineVersion: () => 'test',
  startViteServer: resources.start,
}));

import { runMatrix } from '../src/rendering/driver';

const CLOCK = { resolutionMs: 0.001, crossOriginIsolated: true };
const GPU = 'ANGLE (NVIDIA, Test GPU)';

const session = (identities: ReadonlyArray<string | null>) => {
  let index = 0;
  let renderer: string | null = null;
  const canvas = document.createElement('canvas');
  canvas.id = 'stage';
  const gl = { RENDERER: 0x1f01, getExtension: () => null, getParameter: () => renderer };
  vi.spyOn(canvas, 'getContext').mockImplementation((() => gl) as unknown as typeof canvas.getContext);

  return {
    version: () => '151.0',
    close: async () => {},
    newPage: async () => ({
      goto: async () => {},
      waitForFunction: async () => {},
      evaluate: async <T, A>(callback: (arg: A) => T, arg: A): Promise<T> => {
        document.body.replaceChildren(canvas);
        vi.stubGlobal('navigator', {
          gpu: {
            requestAdapter: async () => ({
              info: { vendor: '', architecture: '', device: '', description: identities[0] ?? '' },
              limits: { maxSampledTexturesPerShaderStage: 16, maxSamplersPerShaderStage: 16 },
            }),
          },
        });
        vi.stubGlobal('__probeClock', () => CLOCK);
        vi.stubGlobal('__runBaselineCell', async (spec: CellSpec): Promise<CellResult> => {
          renderer = identities[index++] ?? null;

          return {
            spec,
            cpuMsMedian: 1,
            cpuMsP95: 1,
            frameMsMedian: null,
            frameMsP95: null,
            queueMsMedian: null,
            queueMsP95: null,
            structural: { drawCalls: 1, textureBinds: 1, bufferUploads: 1 },
            clock: CLOCK,
            status: 'ok',
            renderer: { backend: spec.backend, adapter: renderer },
          };
        });

        return callback(arg);
      },
    }),
  };
};

beforeEach(() => {
  resources.start.mockResolvedValue({ resolvedUrls: { local: ['http://localhost'], network: [] }, close: async () => {} });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

const run = (nodeCounts: readonly number[] = [1]) =>
  runMatrix({
    backends: ['webgl2'],
    selection: { engines: ['exojs', 'pixi'], configs: ['current', 'default'], archetypes: ['static-heavy'], nodeCounts },
    timedFramesOverride: 1,
  });

test('keeps later-arm software fallback visible in the backend summary', async () => {
  resources.launch.mockResolvedValueOnce(session([GPU])).mockResolvedValueOnce(session(['Google SwiftShader']));

  const result = await run();

  expect(result.provenance[0]).toMatchObject({ software: true, adapterMismatch: true });
  expect(result.provenance[0]!.adapter).toContain(GPU);
  expect(result.provenance[0]!.adapter).toContain('Google SwiftShader');
  expect(result.provenance[0]!.adapter).toMatch(/disagree/i);
});

test('keeps a later renderer change in the same arm visible', async () => {
  resources.launch.mockResolvedValueOnce(session([GPU, 'Other GPU'])).mockResolvedValueOnce(session([GPU, GPU]));

  const result = await run([1, 2]);

  expect(result.provenance[0]).toMatchObject({ software: false, adapterMismatch: true });
  expect(result.provenance[0]!.adapter).toContain('Other GPU');
});

test('does not borrow an identified arm for a later unidentifiable arm', async () => {
  resources.launch.mockResolvedValueOnce(session([GPU])).mockResolvedValueOnce(session([null]));

  const result = await run();

  expect(result.provenance[0]).toMatchObject({ adapterUnverified: true });
  expect(result.provenance[0]!.adapter).toMatch(/incomplete/i);
});

test('keeps the existing summary for one consistently observed renderer', async () => {
  resources.launch.mockResolvedValueOnce(session([GPU])).mockResolvedValueOnce(session([GPU]));

  const result = await run();

  expect(result.provenance[0]).toMatchObject({ adapter: GPU, software: false });
  expect(result.provenance[0]!.adapterMismatch).toBeUndefined();
  expect(result.provenance[0]!.adapterUnverified).toBeUndefined();
});

test('rechecks WebGPU availability for a later arm instead of borrowing the first hardware adapter', async () => {
  resources.launch.mockResolvedValueOnce(session([GPU])).mockResolvedValueOnce(session(['Google SwiftShader']));

  const result = await runMatrix({
    backends: ['webgpu'],
    selection: { engines: ['exojs', 'pixi'], configs: ['current', 'default'], archetypes: ['static-heavy'], nodeCounts: [1] },
    timedFramesOverride: 1,
  });

  expect(result.results.map(cell => cell.status)).toEqual(['ok', 'unavailable']);
  expect(result.results[1]!.note).toContain('software adapter refused');
  expect(result.results[1]!.note).toContain('Google SwiftShader');
  expect(result.provenance[0]).toMatchObject({ adapter: GPU, software: false });
});
