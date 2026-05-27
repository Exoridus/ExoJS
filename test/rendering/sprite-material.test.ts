import { MeshMaterial } from '@/rendering/material/MeshMaterial';
import { ShaderSource } from '@/rendering/material/ShaderSource';
import { SpriteMaterial } from '@/rendering/material/SpriteMaterial';
import { Sprite } from '@/rendering/sprite/Sprite';

const minimalGlsl = {
  vertex: '#version 300 es\nvoid main(){gl_Position=vec4(0.0);}',
  fragment: '#version 300 es\nprecision lowp float;out vec4 c;void main(){c=vec4(1.0);}',
};

const createSpriteMaterial = (): SpriteMaterial => new SpriteMaterial({ shader: new ShaderSource({ glsl: minimalGlsl }) });

describe('Sprite.material', () => {
  test('defaults to null', () => {
    expect(new Sprite(null).material).toBeNull();
  });

  test('round-trips an assigned SpriteMaterial', () => {
    const sprite = new Sprite(null);
    const material = createSpriteMaterial();

    sprite.material = material;

    expect(sprite.material).toBe(material);

    sprite.material = null;

    expect(sprite.material).toBeNull();
  });

  test('rejects a material whose target is not "sprite"', () => {
    const sprite = new Sprite(null);
    const meshMaterial = new MeshMaterial({ shader: new ShaderSource({ glsl: minimalGlsl }) });

    // Simulate a JS caller passing the wrong material subclass.
    expect(() => {
      sprite.material = meshMaterial as unknown as SpriteMaterial;
    }).toThrow(/Sprite requires a SpriteMaterial/);
    expect(sprite.material).toBeNull();
  });

  test('destroy clears the material reference', () => {
    const sprite = new Sprite(null);

    sprite.material = createSpriteMaterial();
    sprite.destroy();

    expect(sprite.material).toBeNull();
  });
});
