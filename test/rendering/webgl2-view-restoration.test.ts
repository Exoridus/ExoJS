import type { Application } from '#core/Application';
import { materializeRendererBindings } from '#extensions/materialize';
import { buildCoreRendererBindings } from '#rendering/coreRendererBindings';
import { FilterPass } from '#rendering/FilterPass';
import { RenderingContext } from '#rendering/RenderingContext';
import { Sprite } from '#rendering/sprite/Sprite';
import { RenderTexture } from '#rendering/texture/RenderTexture';
import { View } from '#rendering/View';
import { WebGl2Backend } from '#rendering/webgl2/WebGl2Backend';

import { createFakeCanvas, createFakeWebGl2Context, GlRecorder, installFakeWebGl2Globals } from '../perf/rendering/fakeWebGl2';

test('restores the caller camera and discards a blit batch rejected during the final flush', () => {
  installFakeWebGl2Globals();
  const gl = createFakeWebGl2Context(new GlRecorder());
  const backend = new WebGl2Backend({
    canvas: createFakeCanvas(128, 128, gl),
    options: { canvas: { width: 128, height: 128 }, rendering: { debug: false } },
  } as unknown as Application);
  const camera = View.from({ center: { x: 300, y: 200 }, size: { width: 20, height: 10 }, rotation: 35 });
  const source = new RenderTexture(128, 128);
  const pass = new FilterPass(source);
  const sprite = new Sprite(source).setPosition(300, 200);
  const draw = vi.spyOn(gl, 'drawArraysInstanced').mockImplementationOnce(() => {
    expect(backend.view.center.x).toBe(64);

    throw new Error('draw failed');
  });

  try {
    materializeRendererBindings(backend, buildCoreRendererBindings({}));
    backend.setView(camera);

    expect(() => pass.execute(new RenderingContext(backend))).toThrow('draw failed');
    expect.soft(backend.view).toBe(camera);
    expect
      .soft([backend.view.center.x, backend.view.center.y, backend.view.size.width, backend.view.size.height, backend.view.rotation])
      .toEqual([300, 200, 20, 10, 35]);
    pass.destroy();
    expect.soft(backend.view).toBe(camera);
    backend.flush();
    expect.soft(draw).toHaveBeenCalledTimes(1);
    sprite.render(backend);
    backend.flush();
    expect(draw).toHaveBeenCalledTimes(2);
  } finally {
    draw.mockRestore();
    pass.destroy();
    sprite.destroy();
    source.destroy();
    backend.destroy();
    camera.destroy();
  }
});
