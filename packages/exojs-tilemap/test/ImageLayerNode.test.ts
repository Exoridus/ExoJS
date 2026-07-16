import { RepeatingSprite, type Texture } from '@codexo/exojs';
import { describe, expect, it, vi } from 'vitest';

import { ImageLayer, type ImageLayerOptions } from '../src/ImageLayer';
import { ImageLayerNode } from '../src/ImageLayerNode';

// ── helpers ────────────────────────────────────────────────────────────

function fakeTexture(width = 64, height = 64): Texture {
  return {
    width,
    height,
    flipY: false,
    uid: 0,
    label: 'test',
    destroy: vi.fn(),
    destroyed: false,
  } as unknown as Texture;
}

function makeLayer(opts: Partial<ImageLayerOptions> = {}): ImageLayer {
  return new ImageLayer({
    id: opts.id ?? 1,
    image: opts.image ?? 'bg.png',
    texture: opts.texture === undefined ? fakeTexture() : opts.texture,
    ...opts,
  });
}

/**
 * A minimal stand-in for `RenderPlanBuilder`, mirroring exactly what
 * `Container._collectContent` and the drawable-child collect path read:
 *  - `view.center`         — the parallax patch source,
 *  - `view.getBounds()`    — the repeat-coverage span (Rectangle-like),
 *  - `view.updateId`       — the retained-plan revision key,
 *  - `_isViewCullSuppressed: true` — makes the child `_collect` skip the
 *    `inView` frustum test and go straight to `emitNode` (no cull machinery),
 *  - `emitNode` / `_peekCurrentScopeEntries` — the no-slot capture bookkeeping,
 *  - `backend`             — stored verbatim by the retained-plan cache commit.
 */
function mockBuilder(options: {
  center?: { x: number; y: number };
  bounds?: { x: number; y: number; width: number; height: number };
} = {}): unknown {
  const center = options.center ?? { x: 0, y: 0 };
  const bounds = options.bounds ?? { x: 0, y: 0, width: 0, height: 0 };

  return {
    _isViewCullSuppressed: true,
    backend: {},
    view: {
      updateId: 1,
      center,
      getBounds: () => bounds,
    },
    emitNode(): void {},
    _peekCurrentScopeEntries: (): readonly unknown[] => [],
  };
}

function collect(node: ImageLayerNode, builder: unknown): void {
  (node as unknown as { _collectContent(b: unknown): void })._collectContent(builder);
}

function spriteOf(node: ImageLayerNode): RepeatingSprite {
  return node.children[0] as RepeatingSprite;
}

// ═══════════════════════════════════════════════════════════════════════
// ImageLayerNode — construction
// ═══════════════════════════════════════════════════════════════════════

describe('ImageLayerNode construction', () => {
  it('renders nothing for a null texture (no children)', () => {
    const node = new ImageLayerNode(makeLayer({ texture: null }));

    expect(node.children).toHaveLength(0);
  });

  it('creates one repeating-sprite child sized to the image for a plain layer', () => {
    const node = new ImageLayerNode(makeLayer({ texture: fakeTexture(64, 48) }));

    expect(node.children).toHaveLength(1);
    const sprite = spriteOf(node);
    expect(sprite).toBeInstanceOf(RepeatingSprite);
    // Natural image size, positioned at the node-local origin.
    expect(sprite.width).toBe(64);
    expect(sprite.height).toBe(48);
    expect(sprite.x).toBe(0);
    expect(sprite.y).toBe(0);
  });

  it('positions the node at the layer pixel offset', () => {
    const node = new ImageLayerNode(makeLayer({ offsetX: 64, offsetY: -32 }));

    expect(node.x).toBe(64);
    expect(node.y).toBe(-32);
  });

  it('applies visible/opacity/tint statically from the layer', () => {
    const hidden = new ImageLayerNode(makeLayer({ visible: false }));
    expect(hidden.visible).toBe(false);

    const faded = new ImageLayerNode(makeLayer({ opacity: 0.5 }));
    expect(spriteOf(faded).tint.a).toBeCloseTo(0.5, 6);

    const tinted = new ImageLayerNode(makeLayer({ tintColor: 0xff0000 }));
    const tint = spriteOf(tinted).tint;
    expect(tint.r).toBe(0xff);
    expect(tint.g).toBe(0x00);
    expect(tint.b).toBe(0x00);
  });

  it('exposes the source layer', () => {
    const layer = makeLayer();
    expect(new ImageLayerNode(layer).layer).toBe(layer);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// ImageLayerNode — parallax (mirrors nodes.test.ts TileLayerNode cases)
// ═══════════════════════════════════════════════════════════════════════

describe('ImageLayerNode parallax', () => {
  it('initial position is the layer offset (not parallax-shifted)', () => {
    const node = new ImageLayerNode(
      makeLayer({ offsetX: 10, offsetY: 20, parallaxX: 0.5, parallaxY: 0.5 }),
    );

    // Construction must NOT apply a parallax shift — the shift is render-time only.
    expect(node.x).toBe(10);
    expect(node.y).toBe(20);
  });

  it('position is restored to the base offset after _collectContent', () => {
    const node = new ImageLayerNode(
      makeLayer({ offsetX: 10, offsetY: 20, parallaxX: 0.5, parallaxY: 0.5 }),
    );

    collect(node, mockBuilder({ center: { x: 100, y: 200 } }));

    // After the call the node position must be restored to the base offset.
    expect(node.x).toBe(10);
    expect(node.y).toBe(20);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// ImageLayerNode — repeat coverage (the core math)
// ═══════════════════════════════════════════════════════════════════════

describe('ImageLayerNode repeat coverage', () => {
  it('repeatX: child spans the view with a period-aligned origin', () => {
    // offsetX 10, parallaxX 1, image 64 wide; view bounds { x: -130, width: 300 }.
    const node = new ImageLayerNode(
      makeLayer({ texture: fakeTexture(64, 64), offsetX: 10, repeatX: true }),
    );

    collect(node, mockBuilder({ bounds: { x: -130, y: 0, width: 300, height: 200 } }));

    // parallaxX 1 → nodeX = offsetX = 10 (no patch).
    // localViewMin = viewBounds.x - nodeX = -130 - 10 = -140
    // startLocal   = floor(-140/64)*64 = floor(-2.1875)*64 = -3*64 = -192
    // periods      = ceil((-140 + 300 - (-192))/64) = ceil(352/64) = ceil(5.5) = 6
    // child.x = -192, child.width = 6*64 = 384
    const sprite = spriteOf(node);
    expect(sprite.x).toBe(-192);
    expect(sprite.width).toBe(384);
  });

  it('repeatX with parallax: pattern anchor follows the patched origin', () => {
    // parallaxX 0.5, center.x 100 → patched nodeX = 10 + 100*(1-0.5) = 60.
    const node = new ImageLayerNode(
      makeLayer({ texture: fakeTexture(64, 64), offsetX: 10, parallaxX: 0.5, repeatX: true }),
    );

    collect(node, mockBuilder({
      center: { x: 100, y: 0 },
      bounds: { x: -130, y: 0, width: 300, height: 200 },
    }));

    // nodeX        = 10 + 100*(1 - 0.5) = 60
    // localViewMin = -130 - 60 = -190
    // startLocal   = floor(-190/64)*64 = floor(-2.96875)*64 = -3*64 = -192
    // periods      = ceil((-190 + 300 - (-192))/64) = ceil(302/64) = ceil(4.71875) = 5
    // child.x = -192, child.width = 5*64 = 320
    const sprite = spriteOf(node);
    expect(sprite.x).toBe(-192);
    expect(sprite.width).toBe(320);
  });

  it('repeat coverage holds for negative view coordinates', () => {
    // offsetX 5, parallaxX 1, image 48 wide; view bounds { x: -300, width: 220 }.
    const node = new ImageLayerNode(
      makeLayer({ texture: fakeTexture(48, 48), offsetX: 5, repeatX: true }),
    );

    collect(node, mockBuilder({ bounds: { x: -300, y: 0, width: 220, height: 100 } }));

    // nodeX        = 5
    // localViewMin = -300 - 5 = -305
    // startLocal   = floor(-305/48)*48 = floor(-6.3541…)*48 = -7*48 = -336
    // periods      = ceil((-305 + 220 - (-336))/48) = ceil(251/48) = ceil(5.229…) = 6
    // child.x = -336, child.width = 6*48 = 288
    const sprite = spriteOf(node);
    expect(sprite.x).toBe(-336);
    expect(sprite.width).toBe(288);
  });

  it('non-repeating axis keeps natural image size and local 0', () => {
    // repeatX only; Y must stay natural (imgH) at local 0.
    const node = new ImageLayerNode(
      makeLayer({ texture: fakeTexture(64, 48), offsetX: 10, repeatX: true }),
    );

    collect(node, mockBuilder({ bounds: { x: -130, y: 55, width: 300, height: 200 } }));

    const sprite = spriteOf(node);
    // Y axis is not repeating → natural height, origin unchanged.
    expect(sprite.y).toBe(0);
    expect(sprite.height).toBe(48);
  });

  it('repeatY: child spans the view vertically with a period-aligned origin', () => {
    // repeatY only; offsetY 10, parallaxY 1, image 64 tall; view bounds { y: -130, height: 300 }.
    const node = new ImageLayerNode(
      makeLayer({ texture: fakeTexture(64, 64), offsetY: 10, repeatY: true }),
    );

    collect(node, mockBuilder({ bounds: { x: 0, y: -130, width: 200, height: 300 } }));

    // Mirror of the repeatX derivation on the Y axis:
    // localViewMin = -130 - 10 = -140 → startLocal = -192 → periods = 6 → height 384
    const sprite = spriteOf(node);
    expect(sprite.y).toBe(-192);
    expect(sprite.height).toBe(384);
    // X axis not repeating → natural width at local 0.
    expect(sprite.x).toBe(0);
    expect(sprite.width).toBe(64);
  });

  it('repeatX && repeatY: both axes covered simultaneously', () => {
    // offsetX 10, offsetY 5, parallax 1, image 64×64; view bounds { x: -130, y: -70, width: 300, height: 220 }.
    const node = new ImageLayerNode(
      makeLayer({
        texture: fakeTexture(64, 64),
        offsetX: 10,
        offsetY: 5,
        repeatX: true,
        repeatY: true,
      }),
    );

    collect(node, mockBuilder({ bounds: { x: -130, y: -70, width: 300, height: 220 } }));

    // X axis (nodeX = offsetX = 10):
    // localViewMin = -130 - 10 = -140
    // startLocal   = floor(-140/64)*64 = floor(-2.1875)*64 = -3*64 = -192
    // periods      = ceil((-140 + 300 - (-192))/64) = ceil(352/64) = 6
    // child.x = -192, child.width = 6*64 = 384
    //
    // Y axis (nodeY = offsetY = 5):
    // localViewMin = -70 - 5 = -75
    // startLocal   = floor(-75/64)*64 = floor(-1.171875)*64 = -2*64 = -128
    // periods      = ceil((-75 + 220 - (-128))/64) = ceil(273/64) = ceil(4.265625) = 5
    // child.y = -128, child.height = 5*64 = 320
    const sprite = spriteOf(node);
    expect(sprite.x).toBe(-192);
    expect(sprite.width).toBe(384);
    expect(sprite.y).toBe(-128);
    expect(sprite.height).toBe(320);
  });

  it('repeat layer disables cullable on the node', () => {
    expect(new ImageLayerNode(makeLayer({ repeatX: true })).cullable).toBe(false);
    expect(new ImageLayerNode(makeLayer({ repeatY: true })).cullable).toBe(false);
  });

  it('plain layer stays cullable', () => {
    expect(new ImageLayerNode(makeLayer()).cullable).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// ImageLayerNode — repeat coverage cache
// ═══════════════════════════════════════════════════════════════════════

describe('ImageLayerNode repeat coverage cache', () => {
  it('skips the resize/reposition on a second collect with unchanged view bounds', () => {
    const node = new ImageLayerNode(
      makeLayer({ texture: fakeTexture(64, 64), offsetX: 10, repeatX: true }),
    );
    const builder = mockBuilder({ bounds: { x: -130, y: 0, width: 300, height: 200 } });

    collect(node, builder);

    const sprite = spriteOf(node);
    const setSizeSpy = vi.spyOn(sprite, 'setSize');
    const setPositionSpy = vi.spyOn(sprite, 'setPosition');

    // Same view span and (unpatched, since parallax is 1) origin as the first
    // collect — the cache comparison in `_updateRepeatCoverage` should hit and
    // skip rebuilding the child's geometry entirely.
    collect(node, builder);

    expect(setSizeSpy).not.toHaveBeenCalled();
    expect(setPositionSpy).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════
// ImageLayerNode — pixelSnapMode
// ═══════════════════════════════════════════════════════════════════════

describe('ImageLayerNode pixelSnapMode', () => {
  it('defaults to none and forwards a valid mode to the sprite', () => {
    const node = new ImageLayerNode(makeLayer());
    expect(node.pixelSnapMode).toBe('none');

    node.pixelSnapMode = 'geometry';

    expect(node.pixelSnapMode).toBe('geometry');
    expect(spriteOf(node).pixelSnapMode).toBe('geometry');
  });

  it('rejects an invalid mode and leaves the prior mode unchanged', () => {
    const node = new ImageLayerNode(makeLayer());
    node.pixelSnapMode = 'position';

    expect(() => {
      (node as unknown as { pixelSnapMode: string }).pixelSnapMode = 'bogus';
    }).toThrow();

    expect(node.pixelSnapMode).toBe('position');
    expect(spriteOf(node).pixelSnapMode).toBe('position');
  });

  it('accepts pixelSnapMode on a null-texture node (no drawable to forward to)', () => {
    const node = new ImageLayerNode(makeLayer({ texture: null }));

    expect(() => {
      node.pixelSnapMode = 'geometry';
    }).not.toThrow();
    expect(node.pixelSnapMode).toBe('geometry');
  });
});
