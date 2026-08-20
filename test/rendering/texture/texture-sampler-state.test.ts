import { RenderTexture } from '#rendering/texture/RenderTexture';
import { Texture } from '#rendering/texture/Texture';
import { samplerStateKey } from '#rendering/texture/TextureOptions';
import { ScaleModes, WrapModes } from '#rendering/types';

const makeTexture = (): Texture =>
  new Texture(null, {
    scaleMode: ScaleModes.Linear,
    wrapMode: WrapModes.ClampToEdge,
    premultiplyAlpha: true,
    generateMipMap: true,
    flipY: false,
  });

describe('texture sampling state', () => {
  test('changing the scale mode leaves the upload version untouched', () => {
    const texture = makeTexture();
    const before = texture.version;

    texture.scaleMode = ScaleModes.Nearest;

    expect(texture.scaleMode).toBe(ScaleModes.Nearest);
    expect(texture.version).toBe(before);
  });

  test('changing the wrap mode leaves the upload version untouched', () => {
    const texture = makeTexture();
    const before = texture.version;

    texture.wrapMode = WrapModes.Repeat;

    expect(texture.wrapMode).toBe(WrapModes.Repeat);
    expect(texture.version).toBe(before);
  });

  test('changing an upload parameter bumps the version', () => {
    const premultiply = makeTexture();
    const mipmap = makeTexture();
    const premultiplyBefore = premultiply.version;
    const mipmapBefore = mipmap.version;

    premultiply.premultiplyAlpha = false;
    mipmap.generateMipMap = false;

    expect(premultiply.version).toBeGreaterThan(premultiplyBefore);
    expect(mipmap.version).toBeGreaterThan(mipmapBefore);
  });

  test('re-setting an upload parameter to its current value does not bump the version', () => {
    const texture = makeTexture();

    texture.generateMipMap = true;
    texture.premultiplyAlpha = true;

    expect(texture.version).toBe(makeTexture().version);
  });

  test('a render texture classifies its own state the same way', () => {
    const target = new RenderTexture(8, 8);
    const beforeSampler = target.textureVersion;

    target.scaleMode = ScaleModes.Nearest;
    target.wrapMode = WrapModes.Repeat;

    expect(target.textureVersion).toBe(beforeSampler);

    target.generateMipMap = !target.generateMipMap;

    expect(target.textureVersion).toBeGreaterThan(beforeSampler);
  });

  test('the sampler key separates every scale and wrap mode pair', () => {
    const keys = new Set<number>();
    const scaleModes = Object.values(ScaleModes).filter((value): value is ScaleModes => typeof value === 'number');
    const wrapModes = Object.values(WrapModes).filter((value): value is WrapModes => typeof value === 'number');

    for (const scaleMode of scaleModes) {
      for (const wrapMode of wrapModes) {
        keys.add(samplerStateKey(scaleMode, wrapMode));
      }
    }

    expect(keys.size).toBe(scaleModes.length * wrapModes.length);
  });
});
