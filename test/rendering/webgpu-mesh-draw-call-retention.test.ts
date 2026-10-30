/**
 * The mesh renderer's draw-call list must not keep meshes, materials, commands
 * or textures reachable once the frame it was recorded for is over, nor after
 * the renderer is disconnected from its backend.
 */

import { WebGpuMeshRenderer } from '#rendering/webgpu/WebGpuMeshRenderer';

interface Internals {
  _drawCalls: unknown[];
  _drawCallCount: number;
  _resetFrame(): void;
  onDisconnect(): void;
}

const withRecordedDrawCall = (): Internals => {
  const internals = new WebGpuMeshRenderer() as unknown as Internals;

  internals._drawCalls[0] = { mesh: {}, customShader: null, command: null, texture: {} };
  internals._drawCallCount = 1;

  return internals;
};

describe('WebGpuMeshRenderer draw-call retention', () => {
  test('the end of a frame drops the recorded draw calls', () => {
    const internals = withRecordedDrawCall();

    internals._resetFrame();

    expect(internals._drawCalls.length).toBe(0);
  });

  test('disconnect drops the recorded draw calls', () => {
    const internals = withRecordedDrawCall();

    internals.onDisconnect();

    expect(internals._drawCalls.length).toBe(0);
  });
});
