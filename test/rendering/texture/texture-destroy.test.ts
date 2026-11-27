import { RenderTarget } from '#rendering/RenderTarget';
import { RenderTexture } from '#rendering/texture/RenderTexture';
import { Texture } from '#rendering/texture/Texture';

describe('resource destruction ordering', () => {
  test.each([
    ['Texture', () => new Texture(null)],
    ['RenderTarget', () => new RenderTarget(8, 8)],
    ['RenderTexture', () => new RenderTexture(8, 8)],
  ] as const)('%s stays usable while destroy listeners finish queued work', (_name, create) => {
    const resource = create();
    const listener = vi.fn(() => {
      expect(resource.destroyed).toBe(false);
      resource.destroy();
      expect(resource.destroyed).toBe(false);
    });

    resource.addDestroyListener(listener);
    resource.destroy();
    resource.destroy();

    expect(resource.destroyed).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  test('recursive RenderTexture destruction preserves the source until listeners finish', () => {
    const texture = new RenderTexture(8, 8);
    const source = new DataView(new ArrayBuffer(8 * 8 * 4));

    texture.setSource(source);
    texture.addDestroyListener(() => {
      texture.destroy();
      expect(texture.source).toBe(source);
    });
    texture.destroy();

    expect(texture.source).toBeNull();
  });

  test.each([
    ['Texture', () => new Texture(null)],
    ['RenderTarget', () => new RenderTarget(8, 8)],
  ] as const)('%s propagates listener errors without repeating destruction', (_name, create) => {
    const resource = create();
    const error = new Error('listener failed');
    const listener = vi.fn(() => {
      throw error;
    });

    resource.addDestroyListener(listener);

    expect(() => resource.destroy()).toThrow(error);
    expect(resource.destroyed).toBe(true);
    expect(() => resource.destroy()).not.toThrow();
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
