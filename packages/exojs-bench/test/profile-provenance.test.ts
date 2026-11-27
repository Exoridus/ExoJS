import { describe, expect, test } from 'vitest';

import { profileProvenance } from '../src/rendering/profileProvenance';

describe('profileProvenance', () => {
  test('stamps the WebGPU adapter identity and its software bit', () => {
    const provenance = profileProvenance('webgpu', { adapter: 'ANGLE (NVIDIA, RTX 4090)', usable: true }, null);

    expect(provenance).toEqual({ adapter: 'ANGLE (NVIDIA, RTX 4090)', software: false });
  });

  test('marks a SwiftShader WebGPU adapter as software', () => {
    expect(profileProvenance('webgpu', { adapter: 'Google SwiftShader', usable: true }, null).software).toBe(true);
  });

  test('does not claim verified hardware when the WebGPU identity is unavailable', () => {
    const provenance = profileProvenance('webgpu', null, null);

    expect(provenance.software).toBe(false);
    expect(provenance.adapterUnverified).toBe(true);
    expect(provenance.adapter).toContain('adapter identity unavailable');
  });

  test('does not claim verified hardware when the WebGPU adapter is unusable', () => {
    expect(profileProvenance('webgpu', { adapter: 'no adapter', usable: false }, null).adapterUnverified).toBe(true);
  });

  test('marks a WebGL2 profile with no renderer string as unverified', () => {
    expect(profileProvenance('webgl2', null, null).adapterUnverified).toBe(true);
  });

  test('reads the WebGL2 renderer string and its software bit', () => {
    expect(profileProvenance('webgl2', null, 'ANGLE (llvmpipe, LLVM)')).toEqual({
      adapter: 'ANGLE (llvmpipe, LLVM)',
      software: true,
    });
  });
});
