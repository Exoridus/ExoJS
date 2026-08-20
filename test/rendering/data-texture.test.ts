import { Sprite } from '#rendering/sprite/Sprite';
import { DataTexture } from '#rendering/texture/DataTexture';
import { Texture } from '#rendering/texture/Texture';
import { ScaleModes, TextureFormat, WrapModes } from '#rendering/types';

describe('DataTexture', () => {
  describe('construction', () => {
    test('extends Texture', () => {
      const tex = new DataTexture({ width: 4, height: 4, format: TextureFormat.R8 });
      expect(tex).toBeInstanceOf(Texture);
    });

    test('allocates internal Uint8Array for r8 format', () => {
      const tex = new DataTexture({ width: 4, height: 2, format: TextureFormat.R8 });
      expect(tex.buffer).toBeInstanceOf(Uint8Array);
      expect(tex.buffer.length).toBe(8);
    });

    test('allocates internal Float32Array for r32f format', () => {
      const tex = new DataTexture({ width: 4, height: 2, format: TextureFormat.R32F });
      expect(tex.buffer).toBeInstanceOf(Float32Array);
      expect(tex.buffer.length).toBe(8);
    });

    test('allocates internal Uint8Array of width*height*4 for rgba8', () => {
      const tex = new DataTexture({ width: 4, height: 2, format: TextureFormat.Rgba8 });
      expect(tex.buffer).toBeInstanceOf(Uint8Array);
      expect(tex.buffer.length).toBe(32); // 4 * 2 * 4 channels
    });

    test('allocates internal Float32Array of width*height*4 for rgba32f', () => {
      const tex = new DataTexture({ width: 4, height: 2, format: TextureFormat.Rgba32F });
      expect(tex.buffer).toBeInstanceOf(Float32Array);
      expect(tex.buffer.length).toBe(32);
    });

    test('exposes width, height, format', () => {
      const tex = new DataTexture({ width: 16, height: 8, format: TextureFormat.R32F });
      expect(tex.width).toBe(16);
      expect(tex.height).toBe(8);
      expect(tex.format).toBe(TextureFormat.R32F);
    });

    test('default sampler is nearest + clamp + no mips + no premultiply', () => {
      const tex = new DataTexture({ width: 4, height: 4, format: TextureFormat.R8 });
      expect(tex.scaleMode).toBe(ScaleModes.Nearest);
      expect(tex.wrapMode).toBe(WrapModes.ClampToEdge);
      expect(tex.generateMipMap).toBe(false);
      expect(tex.premultiplyAlpha).toBe(false);
    });

    test('textureOptions overrides defaults', () => {
      const tex = new DataTexture({
        width: 4,
        height: 4,
        format: TextureFormat.R8,
        textureOptions: { scaleMode: ScaleModes.Linear, wrapMode: WrapModes.Repeat },
      });
      expect(tex.scaleMode).toBe(ScaleModes.Linear);
      expect(tex.wrapMode).toBe(WrapModes.Repeat);
    });
  });

  describe('validation', () => {
    test('throws on non-positive width', () => {
      expect(() => new DataTexture({ width: 0, height: 4, format: TextureFormat.R8 })).toThrow(/positive integer/);
    });

    test('throws on non-positive height', () => {
      expect(() => new DataTexture({ width: 4, height: -1, format: TextureFormat.R8 })).toThrow(/positive integer/);
    });

    test('throws on non-integer width', () => {
      expect(() => new DataTexture({ width: 1.5, height: 4, format: TextureFormat.R8 })).toThrow(/positive integer/);
    });

    test('throws when Uint8Array data passed for float format', () => {
      const data = new Uint8Array(16);
      expect(() => new DataTexture({ width: 4, height: 4, format: TextureFormat.R32F, data })).toThrow(/requires a Float32Array/);
    });

    test('throws when Float32Array data passed for byte format', () => {
      const data = new Float32Array(16);
      expect(() => new DataTexture({ width: 4, height: 4, format: TextureFormat.R8, data })).toThrow(/requires a Uint8Array/);
    });

    test('throws when typed-array length mismatches width*height*channels', () => {
      const data = new Uint8Array(15); // expected 16
      expect(() => new DataTexture({ width: 4, height: 4, format: TextureFormat.R8, data })).toThrow(/does not match/);
    });

    test('throws when ArrayBuffer byteLength mismatches expected', () => {
      const data = new ArrayBuffer(15);
      expect(() => new DataTexture({ width: 4, height: 4, format: TextureFormat.R8, data })).toThrow(/does not match/);
    });
  });

  describe('bring-your-own buffer', () => {
    test('uses external Uint8Array as backing buffer (zero-copy)', () => {
      const data = new Uint8Array(16);
      data[0] = 42;
      const tex = new DataTexture({ width: 4, height: 4, format: TextureFormat.R8, data });
      expect(tex.buffer).toBe(data);
      expect(tex.buffer[0]).toBe(42);
    });

    test('uses external Float32Array as backing buffer (zero-copy)', () => {
      const data = new Float32Array(16);
      data[0] = 1.5;
      const tex = new DataTexture({ width: 4, height: 4, format: TextureFormat.R32F, data });
      expect(tex.buffer).toBe(data);
      expect(tex.buffer[0]).toBe(1.5);
    });

    test('wraps ArrayBuffer in correct typed-array view for byte format', () => {
      const data = new ArrayBuffer(16);
      const tex = new DataTexture({ width: 4, height: 4, format: TextureFormat.R8, data });
      expect(tex.buffer).toBeInstanceOf(Uint8Array);
      expect(tex.buffer.buffer).toBe(data);
    });

    test('wraps ArrayBuffer in correct typed-array view for float format', () => {
      const data = new ArrayBuffer(64); // 4*4*4 bytes for r32f
      const tex = new DataTexture({ width: 4, height: 4, format: TextureFormat.R32F, data });
      expect(tex.buffer).toBeInstanceOf(Float32Array);
      expect(tex.buffer.buffer).toBe(data);
    });

    test('mutating external buffer is visible through tex.buffer', () => {
      const data = new Uint8Array(16);
      const tex = new DataTexture({ width: 4, height: 4, format: TextureFormat.R8, data });
      data[5] = 99;
      expect(tex.buffer[5]).toBe(99);
    });
  });

  describe('commit and dirty tracking', () => {
    test('initial construction marks full dirty region', () => {
      const tex = new DataTexture({ width: 4, height: 4, format: TextureFormat.R8 });
      const region = tex._consumeDirtyRegion();
      expect(region).toEqual({ full: true, x: 0, y: 0, width: 4, height: 4 });
    });

    test('_consumeDirtyRegion clears the pending region', () => {
      const tex = new DataTexture({ width: 4, height: 4, format: TextureFormat.R8 });
      tex._consumeDirtyRegion(); // clear initial
      expect(tex._consumeDirtyRegion()).toBeNull();
    });

    test('commit() bumps version and re-marks full dirty', () => {
      const tex = new DataTexture({ width: 4, height: 4, format: TextureFormat.R8 });
      tex._consumeDirtyRegion(); // clear initial
      const versionBefore = tex.version;
      tex.commit();
      expect(tex.version).toBeGreaterThan(versionBefore);
      const region = tex._consumeDirtyRegion();
      expect(region?.full).toBe(true);
    });

    test('commitRect() marks the supplied region', () => {
      const tex = new DataTexture({ width: 8, height: 8, format: TextureFormat.R8 });
      tex._consumeDirtyRegion(); // clear initial
      tex.commitRect(2, 3, 4, 1);
      const region = tex._consumeDirtyRegion();
      expect(region).toEqual({ full: false, x: 2, y: 3, width: 4, height: 1 });
    });

    test('commitRect() unions multiple pending regions', () => {
      const tex = new DataTexture({ width: 16, height: 16, format: TextureFormat.R8 });
      tex._consumeDirtyRegion(); // clear initial
      tex.commitRect(2, 2, 4, 4); // (2,2)..(6,6)
      tex.commitRect(8, 8, 4, 4); // (8,8)..(12,12)
      const region = tex._consumeDirtyRegion();
      expect(region).toEqual({ full: false, x: 2, y: 2, width: 10, height: 10 });
    });

    test('commitRect() unions overlapping pending regions to their bounding box', () => {
      const tex = new DataTexture({ width: 16, height: 16, format: TextureFormat.R8 });
      tex._consumeDirtyRegion(); // clear initial
      tex.commitRect(2, 2, 6, 6); // (2,2)..(8,8)
      tex.commitRect(5, 4, 6, 2); // (5,4)..(11,6) — overlaps on x and y
      const region = tex._consumeDirtyRegion();
      expect(region).toEqual({ full: false, x: 2, y: 2, width: 9, height: 6 });
    });

    test('commitRect() keeps a fully contained region inside the pending one', () => {
      const tex = new DataTexture({ width: 16, height: 16, format: TextureFormat.R8 });
      tex._consumeDirtyRegion(); // clear initial
      tex.commitRect(2, 2, 8, 8);
      tex.commitRect(4, 4, 2, 2); // strictly inside — must not shrink the union
      expect(tex._consumeDirtyRegion()).toEqual({ full: false, x: 2, y: 2, width: 8, height: 8 });
    });

    test('commitRect() after commit() keeps the full flag and the full extent', () => {
      const tex = new DataTexture({ width: 16, height: 16, format: TextureFormat.R8 });
      tex._consumeDirtyRegion();
      tex.commit();
      tex.commitRect(2, 2, 4, 4);
      const region = tex._consumeDirtyRegion();
      expect(region).toEqual({ full: true, x: 0, y: 0, width: 16, height: 16 });
    });

    test('a partial commit after a consume starts a fresh region, not a union with the consumed one', () => {
      const tex = new DataTexture({ width: 16, height: 16, format: TextureFormat.R8 });
      tex._consumeDirtyRegion(); // clear initial full dirty

      tex.commitRect(0, 0, 2, 2);
      expect(tex._consumeDirtyRegion()).toEqual({ full: false, x: 0, y: 0, width: 2, height: 2 });

      tex.commitRect(12, 12, 4, 4);
      expect(tex._consumeDirtyRegion()).toEqual({ full: false, x: 12, y: 12, width: 4, height: 4 });
    });

    test('a partial commit after a consumed FULL region drops the full flag', () => {
      const tex = new DataTexture({ width: 16, height: 16, format: TextureFormat.R8 });
      tex.commit();
      tex._consumeDirtyRegion(); // consume the full region

      tex.commitRect(3, 3, 2, 2);
      expect(tex._consumeDirtyRegion()).toEqual({ full: false, x: 3, y: 3, width: 2, height: 2 });
    });

    test('the consumed region is a reused record — valid for the consuming sync pass, rewritten by the next commit', () => {
      const tex = new DataTexture({ width: 16, height: 16, format: TextureFormat.R8 });
      tex._consumeDirtyRegion(); // clear initial

      tex.commitRect(1, 1, 2, 2);

      const first = tex._consumeDirtyRegion();

      // A synchronous consumer reads correct values for the region it consumed.
      expect(first).toEqual({ full: false, x: 1, y: 1, width: 2, height: 2 });

      tex.commitRect(9, 9, 3, 3);

      const second = tex._consumeDirtyRegion();

      // Same object handed out again (no per-commit allocation), carrying the
      // new region — which is why a consumer must not hold it across a sync.
      expect(second).toBe(first);
      expect(second).toEqual({ full: false, x: 9, y: 9, width: 3, height: 3 });
    });

    test('commitRect() throws on out-of-bounds coords', () => {
      const tex = new DataTexture({ width: 8, height: 8, format: TextureFormat.R8 });
      expect(() => tex.commitRect(5, 5, 5, 5)).toThrow(/out of bounds/);
      expect(() => tex.commitRect(-1, 0, 4, 4)).toThrow(/out of bounds/);
    });

    test('commitRect() throws on non-positive width or height', () => {
      const tex = new DataTexture({ width: 8, height: 8, format: TextureFormat.R8 });
      expect(() => tex.commitRect(0, 0, 0, 4)).toThrow(/positive width/);
      expect(() => tex.commitRect(0, 0, 4, 0)).toThrow(/positive width/);
    });

    test('commitRect() throws on non-integer coords', () => {
      const tex = new DataTexture({ width: 8, height: 8, format: TextureFormat.R8 });
      expect(() => tex.commitRect(0.5, 0, 4, 4)).toThrow(/integer coordinates/);
    });

    test('updateSource keeps dimensions and backing buffer, and marks full dirty', () => {
      const tex = new DataTexture({ width: 16, height: 8, format: TextureFormat.Rgba8 });
      const originalBuffer = tex.buffer;

      tex._consumeDirtyRegion(); // clear initial full dirty
      const versionBefore = tex.version;

      tex.updateSource();

      expect(tex.width).toBe(16);
      expect(tex.height).toBe(8);
      expect(tex.buffer).toBe(originalBuffer);
      expect(tex.version).toBeGreaterThan(versionBefore);
      expect(tex._consumeDirtyRegion()).toEqual({ full: true, x: 0, y: 0, width: 16, height: 8 });
    });
  });

  describe('sprite integration', () => {
    test('Sprite.setTexture(DataTexture) preserves texture bounds across repeated updates', () => {
      const texture = new DataTexture({ width: 16, height: 8, format: TextureFormat.Rgba8 });
      const sprite = new Sprite(texture);

      expect(sprite.texture?.width).toBe(16);
      expect(sprite.texture?.height).toBe(8);

      // Force the path that previously collapsed DataTexture to 0x0.
      sprite.updateTexture();
      sprite.setTexture(null);
      sprite.setTexture(texture);

      expect(sprite.getLocalBounds().width).toBe(16);
      expect(sprite.getLocalBounds().height).toBe(8);
    });
  });
});
