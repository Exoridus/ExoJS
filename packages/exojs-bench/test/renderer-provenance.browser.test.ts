// @vitest-environment node

import { expect, test } from 'vitest';

import { runMatrix, SOFTWARE_LAUNCH_FLAGS } from '../src/rendering/driver';

test('labels a real Chromium software renderer from the measured context', async () => {
  const result = await runMatrix({
    backends: ['webgl2'],
    selection: { engines: ['exojs'], configs: ['current'], archetypes: ['static-heavy'], nodeCounts: [1] },
    timedFramesOverride: 1,
    launchFlags: SOFTWARE_LAUNCH_FLAGS,
  });

  expect(result.results).toHaveLength(1);
  const cell = result.results[0]!;
  expect(cell.status).toBe('ok');
  expect(cell.renderer?.backend).toBe('webgl2');
  expect(cell.renderer?.adapter).toMatch(/swiftshader|llvmpipe|software/i);
  expect(result.provenance[0]).toMatchObject({ adapter: cell.renderer!.adapter, software: true });
  expect(result.provenance[0]!.adapterMismatch).toBeUndefined();
  expect(result.provenance[0]!.adapterUnverified).toBeUndefined();
}, 120_000);
