import { vi } from 'vitest';

import { coreAssetTypes } from '#assets/coreAssetTypes';
import { Loader } from '#assets/Loader';
import { materializeAssetTypes } from '#extensions/materialize';
import { Container } from '#rendering/Container';
import { Sprite } from '#rendering/sprite/Sprite';
import type { Texture } from '#rendering/texture/Texture';
import { ScaleModes, WrapModes } from '#rendering/types';

import { createBuiltinLeaf } from '../../assets/builtin-leaf';
import { makeTestCanvas } from './_backendSetup';
import type { RgbaTuple } from './_pixels';

export const RESIDENCY_SURFACE_SIZE = 128;

const EDGE = 32;
const SOURCE = '/texture-residency-baseline.png';

interface BaselineBackend {
  readonly adapter: string;
  readonly sharesTexture: boolean;
  readonly bytes: () => number;
  readonly uploadedBytes?: () => number;
  readonly bind: (texture: Texture) => void;
  readonly draw: (root: Container) => Promise<((x: number, y: number) => RgbaTuple) | null>;
}

export const verifyTextureResidencyBaseline = async ({
  adapter,
  sharesTexture,
  bytes,
  uploadedBytes,
  bind,
  draw,
}: BaselineBackend): Promise<void> => {
  const canvas = makeTestCanvas(EDGE);
  const context = canvas.getContext('2d')!;

  context.fillStyle = '#ff0000';
  context.fillRect(0, 0, EDGE / 2, EDGE);
  context.fillStyle = '#0000ff';
  context.fillRect(EDGE / 2, 0, EDGE / 2, EDGE);

  const payload = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(blob => (blob === null ? reject(new Error('PNG encoding failed')) : resolve(blob)));
  });
  const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(payload));
  const loader = new Loader();

  materializeAssetTypes(loader, coreAssetTypes);

  const aScope = loader.createScope({ name: 'nearest' });
  const bScope = loader.createScope({ name: 'linear' });
  const options = { generateMipMap: false };
  const a = createBuiltinLeaf('texture', SOURCE, {
    textureOptions: { ...options, scaleMode: ScaleModes.Nearest, wrapMode: WrapModes.ClampToEdge },
  }) as Texture;
  const b = createBuiltinLeaf('texture', SOURCE, {
    textureOptions: { ...options, scaleMode: ScaleModes.Linear, wrapMode: WrapModes.Repeat },
  }) as Texture;
  const root = new Container();

  try {
    loader._adopt(a, aScope);
    loader._adopt(b, bScope);
    await Promise.all([a.loaded, b.loaded]);

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(a.source).not.toBeNull();
    expect(a.source).toBe(b.source);

    const priorUploadBytes = uploadedBytes?.() ?? 0;
    bind(a);
    const firstBindBytes = bytes();
    const firstUploadBytes = uploadedBytes?.() ?? 0;

    bind(b);
    const textureBytes = EDGE * EDGE * 4;
    const bothAllocationBytes = sharesTexture ? textureBytes : 2 * textureBytes;

    expect(bytes() - firstBindBytes).toBe(sharesTexture ? 0 : textureBytes);

    if (uploadedBytes !== undefined) {
      expect(firstUploadBytes - priorUploadBytes).toBe(textureBytes);
      expect(uploadedBytes() - firstUploadBytes).toBe(sharesTexture ? 0 : textureBytes);
    }

    const left = new Sprite(a);
    const right = new Sprite(b).setPosition(2 * EDGE, 0);

    left.scale.set(2, 2);
    right.scale.set(2, 2);
    root.addChild(left);
    root.addChild(right);

    const pixel = await draw(root);

    if (pixel === null) {
      return;
    }

    const nearest = pixel(EDGE - 1, EDGE);
    const linear = pixel(3 * EDGE - 1, EDGE);

    expect(nearest[0]).toBeGreaterThan(245);
    expect(nearest[2]).toBeLessThan(10);
    expect(linear[0]).toBeGreaterThan(20);
    expect(linear[2]).toBeGreaterThan(20);

    const bound = bytes();

    if (sharesTexture) {
      b.setGenerateMipMap(true);
      bind(b);
      expect(bytes() - bound).toBe(5460);

      b.setGenerateMipMap(false);
      bind(b);
      expect(bytes()).toBe(bound);
    }

    aScope.release(a);
    expect(b.loadState).toBe('ready');
    expect(bytes()).toBe(bound);

    a.releaseGpu();
    expect(bytes()).toBe(sharesTexture ? bound : bound - textureBytes);

    bScope.release(b);
    expect(bytes()).toBe(bound - bothAllocationBytes);
    expect(a.source).toBeNull();
    expect(b.source).toBeNull();

    loader._adopt(a, aScope);
    await a.loaded;
    expect(a.source).not.toBeNull();
    expect(a.source).toBe(b.source);

    bind(a);
    expect(bytes()).toBe(bound - bothAllocationBytes + textureBytes);
    console.log({
      adapter,
      allocationBytesPerHandle: textureBytes,
      bothAllocationBytes,
      fetchesAfterReacquire: fetch.mock.calls.length,
      nearest,
      linear,
    });
  } finally {
    root.destroy();
    aScope.destroy();
    bScope.destroy();
    loader.destroy();
    a.destroy();
    b.destroy();
    fetch.mockRestore();
  }
};
