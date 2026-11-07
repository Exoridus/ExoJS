import type { Application } from '#core/Application';
import { WebGl2Backend } from '#rendering/webgl2/WebGl2Backend';

import { createFakeCanvas, createFakeWebGl2Context, GlRecorder, installFakeWebGl2Globals } from '../perf/rendering/fakeWebGl2';

test('root viewport follows a backing-store resize with unchanged logical dimensions', () => {
  installFakeWebGl2Globals();
  const gl = createFakeWebGl2Context(new GlRecorder());
  const canvas = createFakeCanvas(64, 64, gl);
  const backend = new WebGl2Backend({
    canvas,
    options: { canvas: { width: 64, height: 64 }, rendering: { debug: false } },
  } as unknown as Application);
  const viewport = vi.spyOn(gl, 'viewport');

  canvas.width = 128;
  canvas.height = 128;
  backend.resize(64, 64);

  expect(viewport).toHaveBeenLastCalledWith(0, 0, 128, 128);
  backend.destroy();
});
