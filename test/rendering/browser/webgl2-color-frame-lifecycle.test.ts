/**
 * Frame lifecycle under the color-managed rendering pipeline (R24): a GL
 * antialias request against the offscreen working target is measured -
 * reported once, rather than silently doing nothing the way an unmanaged
 * offscreen `RenderTexture` always has.
 */
import { expect, test, vi } from 'vitest';

import type { Application } from '#core/Application';
import { Color } from '#core/Color';
import { logger } from '#core/Logger';

import { createWebGl2TestBackend } from './_backendSetup';

vi.mock('#rendering/colorPipelineActivation', () => ({ COLOR_PIPELINE_ENABLED: true }));

test('warns once when webglAttributes.antialias is requested while the color pipeline is active', async () => {
  const { WebGl2Backend } = await import('#rendering/webgl2/WebGl2Backend');
  const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);

  const canvas = document.createElement('canvas');

  canvas.width = 2;
  canvas.height = 2;

  const app = {
    canvas,
    options: {
      canvas: { width: 2, height: 2 },
      clearColor: Color.black,
      rendering: { webglAttributes: { antialias: true } },
    },
  } as unknown as Application;

  const backend = new WebGl2Backend(app);

  try {
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0]?.[0]).toMatch(/antialias/i);
  } finally {
    backend.destroy();
    warnSpy.mockRestore();
  }
});

test('does not warn when antialias is not requested', async () => {
  const { WebGl2Backend } = await import('#rendering/webgl2/WebGl2Backend');
  const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);

  const backend = await createWebGl2TestBackend(2);

  try {
    expect(warnSpy).not.toHaveBeenCalled();
  } finally {
    backend.destroy();
    warnSpy.mockRestore();
  }
});
