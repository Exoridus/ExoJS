import { describe, expect, test } from 'vitest';

import { createUserUniformState, packUserUniforms } from '#rendering/webgpu/userUniforms';

describe('packUserUniforms', () => {
  test('a uniform that is not exactly representable in f32 does not report a change on repeat', () => {
    const state = createUserUniformState();
    const values: Parameters<typeof packUserUniforms>[0] = [0.1, [0.2, 0.3, 0.7]];

    expect(packUserUniforms(values, state, false)).toBe(true);
    expect(packUserUniforms(values, state, false)).toBe(false);
    expect(packUserUniforms(values, state, false)).toBe(false);
  });

  test('a real change is still reported', () => {
    const state = createUserUniformState();

    packUserUniforms([0.1], state, false);

    expect(packUserUniforms([0.2], state, false)).toBe(true);
  });
});
