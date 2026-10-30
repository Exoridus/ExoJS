import { describe, expect, test } from 'vitest';

import { Color } from '#core/Color';
import { MeshMaterial } from '#rendering/material/MeshMaterial';
import { Graphics } from '#rendering/primitives/Graphics';
import { Shader } from '#rendering/shader/Shader';
import { Spritesheet } from '#rendering/sprite/Spritesheet';
import { HTMLText } from '#rendering/text/HTMLText';
import { DataTexture } from '#rendering/texture/DataTexture';
import { resolvePixelRegionBounds } from '#rendering/texture/PixelReader';
import type { RenderTexture } from '#rendering/texture/RenderTexture';
import type { Texture } from '#rendering/texture/Texture';
import { TextureFormat } from '#rendering/types';
import { UniformType } from '#rendering/uniforms/UniformType';
import { View } from '#rendering/View';

describe('View.zoom', () => {
  test.each([0, -2, Number.NaN, Number.POSITIVE_INFINITY])('rejects factor %s without touching the view', factor => {
    const view = new View(0, 0, 100, 100);

    expect(() => view.zoom(factor)).toThrow(RangeError);
    expect(view.width).toBe(100);
    expect(view.zoomLevel).toBe(1);
  });
});

describe('resolvePixelRegionBounds', () => {
  const source = { width: 16, height: 16 } as unknown as RenderTexture;
  const region = (left: number, top: number, width: number, height: number): never => ({ left, top, width, height }) as never;

  test.each([region(Number.NaN, 0, 4, 4), region(0, 0, Number.NaN, 4), region(0, Number.NaN, 4, 4), region(0, 0, 4, Number.NaN)])(
    'refuses a NaN rectangle',
    rect => {
      expect(() => resolvePixelRegionBounds('read', source, rect)).toThrow();
    },
  );

  test('accepts an in-bounds rectangle', () => {
    expect(resolvePixelRegionBounds('read', source, region(2, 2, 4, 4))).toEqual({ x: 2, y: 2, width: 4, height: 4 });
  });
});

describe('Graphics', () => {
  test.each([0, -3, Number.NaN])('drawCircle with radius %s draws nothing', radius => {
    const graphics = new Graphics();

    graphics.fillColor = new Color(255, 0, 0);
    expect(() => graphics.drawCircle(0, 0, radius)).not.toThrow();
    expect(graphics.children.length).toBe(0);
  });

  test('drawEllipse with a non-positive radius draws nothing', () => {
    const graphics = new Graphics();

    graphics.fillColor = new Color(255, 0, 0);
    expect(() => graphics.drawEllipse(0, 0, 0, 5)).not.toThrow();
    expect(() => graphics.drawEllipse(0, 0, 5, -1)).not.toThrow();
    expect(graphics.children.length).toBe(0);
  });

  test('a throwing child teardown still releases the graphics colours', () => {
    const graphics = new Graphics();
    const fill = (graphics as unknown as { _fillColor: { destroy(): void } })._fillColor;
    let released = false;

    fill.destroy = (): void => {
      released = true;
    };

    graphics.fillColor = new Color(255, 0, 0);
    graphics.drawCircle(0, 0, 4);

    graphics.children[0]!.destroy = (): void => {
      throw new Error('child failed');
    };

    expect(() => graphics.destroy()).toThrow('child failed');
    expect(released).toBe(true);
  });
});

describe('Material.destroy', () => {
  test('runs every dispose callback and clears them even when one throws', () => {
    const material = new MeshMaterial({ shader: new Shader({ glsl: { vertex: 'v', fragment: 'f' } }) });
    const calls: string[] = [];

    material.onDispose(() => {
      calls.push('first');

      throw new Error('first failed');
    });
    material.onDispose(() => calls.push('second'));

    expect(() => material.destroy()).toThrow('first failed');
    expect(calls).toEqual(['first', 'second']);

    material.destroy();
    expect(calls).toEqual(['first', 'second']);
  });
});

describe('Texture.destroy', () => {
  test('a throwing destroy listener does not skip the payload release', () => {
    const texture = new DataTexture({ width: 4, height: 4, format: TextureFormat.Rgba8 });

    texture.addDestroyListener(() => {
      throw new Error('listener failed');
    });

    expect(() => texture.destroy()).toThrow('listener failed');
    expect(texture.destroyed).toBe(true);
    expect((texture as unknown as { _destroyListeners: Set<unknown> })._destroyListeners.size).toBe(0);
  });
});

describe('Spritesheet.addFrame', () => {
  test('replacing a frame destroys the previous rectangle and sprite', () => {
    const texture = { width: 128, height: 64, flipY: false, updateSource: () => {} } as unknown as Texture;
    const sheet = new Spritesheet(texture, { frames: { a: { frame: { x: 0, y: 0, w: 16, h: 16 } } } });
    const oldSprite = sheet.sprites.get('a')!;
    let destroyed = false;

    oldSprite.destroy = (): void => {
      destroyed = true;
    };

    sheet.addFrame('a', { frame: { x: 16, y: 0, w: 16, h: 16 } });

    expect(destroyed).toBe(true);
    expect(sheet.sprites.get('a')).not.toBe(oldSprite);
  });
});

describe('HTMLText', () => {
  test.each([{ width: 0 }, { height: -1 }, { resolution: 0 }, { resolution: Number.NaN }])('constructor rejects %j', options => {
    expect(() => new HTMLText('x', options)).toThrow(RangeError);
  });
});

describe('vector uniforms', () => {
  test.each([
    [UniformType.Vec2, [1]],
    [UniformType.Vec3, [1, 2]],
    [UniformType.Vec4, [1, 2, 3]],
  ] as const)('%s default shorter than its component count is rejected', (type, value) => {
    const shader = new Shader({
      glsl: { vertex: 'v', fragment: 'f' },
      uniforms: { v: { type, default: [...value] as never } },
    });

    expect(() => new MeshMaterial({ shader })).toThrow();
  });
});
