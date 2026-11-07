import { expect, test, vi } from 'vitest';

import { WebGl2MeshRenderer } from '#rendering/webgl2/WebGl2MeshRenderer';

interface SlotBinder {
  _bindCustomTexture(shader: unknown, name: string, texture: unknown, slot: number, backend: unknown): number;
}

const binder = Object.create(WebGl2MeshRenderer.prototype) as SlotBinder;

Object.defineProperty(binder, '_slotScratches', { value: Array.from({ length: 8 }, () => new Int32Array(1)) });

test('texture bindings the program discarded do not consume custom texture slots', () => {
  const shader = { uniforms: new Map<string, unknown>() };
  const backend = { bindTexture: vi.fn() };
  let slot = 1;

  for (let i = 0; i < 12; i++) {
    slot = binder._bindCustomTexture(shader, `unused${i}`, {}, slot, backend);
  }

  expect(slot).toBe(1);
  expect(backend.bindTexture).not.toHaveBeenCalled();
});

test('active texture bindings still advance the slot and respect the budget', () => {
  const shader = { uniforms: new Map([['a', {}]]), getUniform: () => ({ setValue: vi.fn() }) };
  const backend = { bindTexture: vi.fn() };

  expect(binder._bindCustomTexture(shader, 'a', {}, 1, backend)).toBe(2);
  expect(() => binder._bindCustomTexture(shader, 'a', {}, 8, backend)).toThrow(/texture bindings/);
});
