import { LutFilter } from '#rendering/filters/LutFilter';
import { RenderNode } from '#rendering/RenderNode';
import { type DataTexture } from '#rendering/texture/DataTexture';
import { Texture } from '#rendering/texture/Texture';

class ObservingNode extends RenderNode {
  public invalidations = 0;
  public onInvalidated: (() => void) | null = null;

  public override invalidateCache(): this {
    this.invalidations++;
    this.onInvalidated?.();

    return super.invalidateCache();
  }
}

class ObservingLutFilter extends LutFilter {
  public invalidations = 0;

  public override invalidate(): void {
    this.invalidations++;
    super.invalidate();
  }
}

const shaderCubeSize = (filter: LutFilter): number => (filter as unknown as { _lutSizeUniform: { value: number } })._lutSizeUniform.value;

const fillPixels = (texture: Texture, width: number, height: number): void => {
  texture.setPixels({
    colorSpace: 'none',
    alphaMode: 'straight',
    levels: [{ width, height, data: new Uint8Array(width * height * 4) }],
  });
};

describe('LutFilter texture lifecycle', () => {
  test.each([9, 32])('a ready cube of size %i overrides the constructor hint', size => {
    const texture = LutFilter.identityLut3D(size);
    const filter = new LutFilter({ size: 17 }).setLut(texture);

    expect(filter.size).toBe(size);
    expect(shaderCubeSize(filter)).toBe(size);
    filter.destroy();
    texture.destroy();
  });

  test('keeps the declared cube size until the empty handle has valid cube dimensions', () => {
    const texture = new Texture(null, { colorSpace: 'none' });
    const filter = new LutFilter({ size: 17 }).setLut(texture);

    expect(filter.size).toBe(17);
    expect(shaderCubeSize(filter)).toBe(17);

    fillPixels(texture, 1, 1);

    expect(filter.size).toBe(17);
    expect(shaderCubeSize(filter)).toBe(17);

    fillPixels(texture, 289, 17);

    expect(filter.size).toBe(17);
    expect(shaderCubeSize(filter)).toBe(17);
    filter.destroy();
    texture.destroy();
  });

  test('follows replacement payload dimensions before cached owners are invalidated', () => {
    const texture = new Texture(null, { colorSpace: 'none' });
    const filter = new LutFilter({ size: 17 }).setLut(texture);
    const owner = new ObservingNode().addFilter(filter);
    const observed = new Set<string>();

    owner.onInvalidated = (): void => {
      observed.add(`${shaderCubeSize(filter)}:${texture.width}:${texture.height}:${texture.resolvedMetadata.storageFormat}`);
    };

    fillPixels(texture, 81, 9);

    expect(filter.size).toBe(9);
    expect(observed).toEqual(new Set(['9:81:9:rgba8']));

    observed.clear();
    fillPixels(texture, 1024, 32);

    expect(filter.size).toBe(32);
    expect(observed).toEqual(new Set(['32:1024:32:rgba8']));

    texture.setPixels(null);

    expect(filter.size).toBe(32);
    expect(shaderCubeSize(filter)).toBe(32);
    owner.destroy();
    filter.destroy();
    texture.destroy();
  });

  test('follows a browser source resized in place', () => {
    const canvas = document.createElement('canvas');

    canvas.width = 4;
    canvas.height = 2;

    const texture = LutFilter.fromImage(canvas);
    const filter = new LutFilter().setLut(texture);
    const owner = new ObservingNode().addFilter(filter);
    const before = owner.invalidations;

    canvas.width = 81;
    canvas.height = 9;
    texture.updateSource();

    expect(filter.size).toBe(9);
    expect(shaderCubeSize(filter)).toBe(9);
    expect(owner.invalidations).toBeGreaterThan(before);
    owner.destroy();
    filter.destroy();
    texture.destroy();
  });

  test.each(['3d', 'rgb1d'] as const)('committing a %s LUT invalidates every owner once without changing dimensions', mode => {
    const filter = new LutFilter({ mode });
    const texture = filter.lut as DataTexture;
    const first = new ObservingNode().addFilter(filter);
    const second = new ObservingNode().addFilter(filter);

    filter.setLut(texture).setLut(texture);

    const firstBefore = first.invalidations;
    const secondBefore = second.invalidations;

    texture.buffer[0] = 255;
    texture.commit();

    expect(first.invalidations).toBe(firstBefore + 1);
    expect(second.invalidations).toBe(secondBefore + 1);
    first.destroy();
    second.destroy();
    filter.destroy();
  });

  test('replacement and destruction stop observing borrowed LUTs', () => {
    const first = LutFilter.identityLut3D(9);
    const second = LutFilter.identityLut3D(32);
    const filter = new ObservingLutFilter().setLut(first).setLut(second);
    const afterReplacement = filter.invalidations;

    first.commit();

    expect(filter.invalidations).toBe(afterReplacement);
    expect(filter.size).toBe(32);

    second.commit();

    expect(filter.invalidations).toBe(afterReplacement + 1);
    filter.destroy();

    const afterDestroy = filter.invalidations;

    second.commit();

    expect(filter.invalidations).toBe(afterDestroy);
    expect(first.destroyed).toBe(false);
    expect(second.destroyed).toBe(false);
    first.destroy();
    second.destroy();
  });

  test('a rejected replacement preserves the current LUT subscription', () => {
    const texture = LutFilter.identityLut3D(9);
    const filter = new LutFilter().setLut(texture);
    const owner = new ObservingNode().addFilter(filter);
    const invalid = new Texture(null, { colorSpace: 'srgb' });
    const before = owner.invalidations;

    expect(() => filter.setLut(invalid)).toThrow(/colorSpace: 'srgb'/);
    expect(filter.lut).toBe(texture);
    expect(owner.invalidations).toBe(before);

    texture.commit();

    expect(owner.invalidations).toBe(before + 1);
    expect(texture.destroyed).toBe(false);
    owner.destroy();
    filter.destroy();
    texture.destroy();
    invalid.destroy();
  });

  test.each(['replace', 'destroy'] as const)('a listener can %s another filter during the same LUT update', action => {
    const texture = LutFilter.identityLut3D(9);
    const replacement = LutFilter.identityLut3D(32);
    const first = new LutFilter().setLut(texture);
    const second = new ObservingLutFilter().setLut(texture);
    const owner = new ObservingNode().addFilter(first);
    let afterAction = -1;

    owner.onInvalidated = (): void => {
      if (action === 'replace') {
        second.setLut(replacement);
      } else {
        second.destroy();
      }

      afterAction = second.invalidations;
    };

    texture.commit();

    expect(afterAction).toBeGreaterThanOrEqual(0);
    expect(second.invalidations).toBe(afterAction);
    expect(texture.destroyed).toBe(false);
    owner.destroy();
    first.destroy();
    second.destroy();
    texture.destroy();
    replacement.destroy();
  });
});
