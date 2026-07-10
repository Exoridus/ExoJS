import { attachWebGl2Probe } from './structural';

const makeFakeGl = () => {
  const calls: string[] = [];

  return {
    calls,
    drawElements: () => calls.push('drawElements'),
    drawArrays: () => calls.push('drawArrays'),
    drawElementsInstanced: () => calls.push('drawElementsInstanced'),
    bindTexture: () => calls.push('bindTexture'),
    bufferSubData: () => calls.push('bufferSubData'),
    bufferData: () => calls.push('bufferData'),
    clear: () => calls.push('clear'),
  } as unknown as WebGL2RenderingContext & { calls: string[] };
};

describe('attachWebGl2Probe', () => {
  test('counts draw calls across all draw entry points', () => {
    const gl = makeFakeGl();
    const probe = attachWebGl2Probe(gl);

    gl.drawElements(0, 0, 0, 0);
    gl.drawArrays(0, 0, 0);
    gl.drawElementsInstanced(0, 0, 0, 0, 0);

    expect(probe.counters.drawCalls).toBe(3);
    probe.detach();
  });

  test('counts texture binds and buffer uploads separately', () => {
    const gl = makeFakeGl();
    const probe = attachWebGl2Probe(gl);

    gl.bindTexture(0, null);
    gl.bindTexture(0, null);
    gl.bufferSubData(0, 0, new Float32Array(1));
    gl.bufferData(0, new Float32Array(1), 0);

    expect(probe.counters.textureBinds).toBe(2);
    expect(probe.counters.bufferUploads).toBe(2);
    expect(probe.counters.drawCalls).toBe(0);
    probe.detach();
  });

  test('still forwards to the underlying implementation', () => {
    const gl = makeFakeGl();
    const probe = attachWebGl2Probe(gl);

    gl.drawArrays(0, 0, 0);

    expect(gl.calls).toEqual(['drawArrays']);
    probe.detach();
  });

  test('reset() zeroes the counters', () => {
    const gl = makeFakeGl();
    const probe = attachWebGl2Probe(gl);

    gl.drawArrays(0, 0, 0);
    probe.reset();

    expect(probe.counters.drawCalls).toBe(0);
    probe.detach();
  });

  test('detach() restores the original methods (no double counting)', () => {
    const gl = makeFakeGl();
    const probe = attachWebGl2Probe(gl);

    probe.detach();
    gl.drawArrays(0, 0, 0);

    expect(probe.counters.drawCalls).toBe(0);
    expect(gl.calls).toEqual(['drawArrays']);
  });
});
