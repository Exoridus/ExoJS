import { Shader } from 'rendering/shader/Shader';
import { ShaderAttribute } from 'rendering/shader/ShaderAttribute';

describe('Shader runtime ordering', () => {
    it('initializes runtime reflection during connect so attributes are available before bind', () => {
        const shader = new Shader('vertex', 'fragment');
        const initialize = jest.fn((target: Shader) => {
            target.attributes.set('a_position', new ShaderAttribute(0, 'a_position', 0));
        });
        const runtime = {
            initialize,
            bind: jest.fn(),
            unbind: jest.fn(),
            sync: jest.fn(),
            destroy: jest.fn(),
        };

        shader.connect(runtime);

        expect(initialize).toHaveBeenCalledTimes(1);
        expect(shader.getAttribute('a_position')).toBeInstanceOf(ShaderAttribute);
    });
});
