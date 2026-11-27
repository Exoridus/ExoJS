import { expect, test, vi } from 'vitest';

const created: unknown[] = [];
const destroyed: unknown[] = [];

vi.mock('#rendering/webgl2/WebGl2Shader', () => ({
  WebGl2Shader: class {
    public uniforms = new Map();
    public uniformBlockData: unknown = null;

    public constructor() {
      created.push(this);
    }

    public connect(): void {}

    public sync(): void {}

    public destroy(): void {
      destroyed.push(this);
    }
  },
}));
vi.mock('#rendering/webgl2/shaderProgram', () => ({ createWebGl2ShaderProgram: () => ({}) }));

const { WebGl2SpriteRenderer } = await import('#rendering/webgl2/WebGl2SpriteRenderer');

test('custom shader dispose hook is registered once across reconnects and releases once per dispose', () => {
  const renderer = Object.create(WebGl2SpriteRenderer.prototype) as {
    _customShaders: Map<unknown, unknown>;
    _disposeHooked: WeakSet<object>;
    _maxCustomTextureSlots: number;
    _getOrCreateCustomShader(material: unknown, gl: unknown): unknown;
  };

  renderer._customShaders = new Map();
  renderer._disposeHooked = new WeakSet();
  renderer._maxCustomTextureSlots = 0;

  const callbacks: Array<() => void> = [];
  const material = {
    shader: { _resolveGlsl: () => ({ vertex: null, fragment: 'void main() {}' }) },
    _blocks: null,
    onDispose: (callback: () => void): void => {
      callbacks.push(callback);
    },
  };

  renderer._getOrCreateCustomShader(material, {});
  renderer._customShaders.clear();
  renderer._getOrCreateCustomShader(material, {});

  expect(callbacks).toHaveLength(1);

  destroyed.length = 0;
  callbacks[0]!();

  expect(created).toHaveLength(2);
  expect(destroyed).toHaveLength(1);
  expect(destroyed[0]).toBe(created[1]);

  callbacks.length = 0;
  renderer._getOrCreateCustomShader(material, {});

  expect(callbacks).toHaveLength(1);

  callbacks[0]!();

  expect(destroyed).toHaveLength(2);
  expect(destroyed[1]).toBe(created[2]);
});
