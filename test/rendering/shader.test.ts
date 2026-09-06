import { WebGl2Shader } from '#rendering/webgl2/WebGl2Shader';
import { WebGl2ShaderAttribute } from '#rendering/webgl2/WebGl2ShaderAttribute';

describe('WebGl2Shader runtime ordering', () => {
  it('initializes runtime reflection during connect so attributes are available before bind', () => {
    const shader = new WebGl2Shader('vertex', 'fragment');
    const initialize = vi.fn((target: WebGl2Shader) => {
      target.attributes.set('a_position', new WebGl2ShaderAttribute(0, 'a_position', 0));
    });
    const runtime = {
      initialize,
      bind: vi.fn(),
      unbind: vi.fn(),
      sync: vi.fn(),
      destroy: vi.fn(),
    };

    shader.connect(runtime);

    expect(initialize).toHaveBeenCalledTimes(1);
    expect(shader.getAttribute('a_position')).toBeInstanceOf(WebGl2ShaderAttribute);
  });
});
