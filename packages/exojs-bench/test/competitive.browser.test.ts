// @vitest-environment node

import { mkdirSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

import { runMatrix, SOFTWARE_LAUNCH_FLAGS } from '../src/rendering/driver';
import { mutationSignature, selectMutationIndices } from '../src/shared/mutation';

test('all three adapters render the deterministic dirty controls and retain raw evidence', async () => {
  const captureDir = resolve('packages/exojs-bench/run-competitive-smoke');
  mkdirSync(captureDir, { recursive: true });
  const result = await runMatrix({
    backends: ['webgl2'],
    selection: {
      engines: ['exojs', 'pixi', 'phaser'],
      configs: ['current', 'default', 'webgl2'],
      archetypes: ['dirty-0', 'dirty-100'],
      nodeCounts: [1000],
    },
    sampling: { profile: 'deep', timedFrames: 5, warmupFrames: 2, cycles: 1, orderSeed: 0xc0ffee },
    launchFlags: SOFTWARE_LAUNCH_FLAGS,
    captureDir,
  });

  expect(result.results).toHaveLength(6);

  for (const cell of result.results) {
    expect(cell.status).toBe('ok');
    expect(cell.renderer?.backend).toBe('webgl2');
    expect(cell.renderer?.adapter).toMatch(/swiftshader|llvmpipe|software/i);
    expect(result.provenance[0]).toMatchObject({ adapter: cell.renderer!.adapter, software: true });
    expect(result.provenance[0]!.adapterMismatch).toBeUndefined();
    expect(result.provenance[0]!.adapterUnverified).toBeUndefined();
    expect(cell.telemetry?.cpuMs).toHaveLength(5);
    expect(cell.telemetry?.rafMs).toHaveLength(4);
    expect(cell.telemetry?.structuralTotals?.drawCalls).toBeGreaterThan(0);
    expect(cell.telemetry?.viewport).toEqual({ width: 1280, height: 720, dpr: 1 });
    const fraction = cell.spec.archetype === 'dirty-0' ? 0 : 1;
    expect(cell.telemetry?.mutation).toMatchObject({
      nominalFraction: fraction,
      selectedCount: fraction * 1000,
      verified: true,
      signature: mutationSignature(selectMutationIndices(1000, fraction, 0xc0ffee)),
    });
    expect(readdirSync(captureDir)).toContain(
      `${cell.spec.backend}-${cell.spec.archetype}-1000-${cell.spec.engine}-${cell.spec.config}.png`,
    );
  }
}, 120_000);
