import { Color } from '#core/Color';
import { Container } from '#rendering/Container';
import { BlurFilter } from '#rendering/filters/BlurFilter';
import { ColorFilter } from '#rendering/filters/ColorFilter';
import { Graphics } from '#rendering/primitives/Graphics';
import type { RenderNode } from '#rendering/RenderNode';
import { Sprite } from '#rendering/sprite/Sprite';
import { Text } from '#rendering/text/Text';
import { Texture } from '#rendering/texture/Texture';

import type { ProbeSceneId } from './matrix';

/**
 * Scenes for the manual DPR / internal-target probe.
 *
 * Every scene is built from PUBLIC engine API only — `Graphics`, `Sprite`,
 * `Text`, `ColorFilter`, `BlurFilter`, `cacheAsTexture`. Nothing here is a new
 * engine feature; the probe measures paths a user already has.
 */

/** Logical (CSS) side length of the probe stage. Fits an iPhone 13 Pro's 390pt portrait width with margin. */
export const STAGE_SIZE = 360;

/** Full-stage quads the `overdraw` scene stacks. Chosen so DPR 3 is genuinely fill-bound on a phone without wedging it. */
export const OVERDRAW_LAYERS = 24;

/** Blur radius, in target texels, at scale 1. */
export const BLUR_RADIUS = 6;

/** Blur sample quality. Kept low: the probe measures target SIZE cost, not filter quality. */
export const BLUR_QUALITY = 2;

/** One built scene plus everything the runner needs to drive and dismantle it. */
export interface ProbeScene {
  /** The node the probe renders each frame. */
  readonly root: Container;
  /**
   * Nodes with `cacheAsTexture` enabled, whose cache texture the probe
   * instruments. Empty for every other scene.
   */
  readonly cacheNodes: readonly RenderNode[];
  /** Advance one frame. A static scene (see `cache-texture`) does nothing here. */
  update(frame: number): void;
  /** Release every GPU resource the scene owns. */
  dispose(): void;
}

/** Options every scene builder takes. */
export interface ProbeSceneOptions {
  /** Logical stage width/height in CSS units. */
  readonly stageSize: number;
  /**
   * Internal-target multiplier the cell runs at (1 in `current` mode). Scenes
   * use it only to keep an effect's LOGICAL appearance constant — see the blur
   * radius below — never to change what is drawn.
   */
  readonly probeScale: number;
}

/**
 * A small texture with hard, off-axis edges: two diagonals and a corner wedge on
 * a flat field.
 *
 * Deliberately a real raster texture, not vector art — a sprite is the one part
 * of the scene whose sharpness CANNOT improve with device pixels, so it is the
 * control against which the resolution-independent content (Graphics, SDF text)
 * is judged.
 */
const createEdgeTexture = (size: number): Texture => {
  const canvas = document.createElement('canvas');

  canvas.width = size;
  canvas.height = size;

  const context = canvas.getContext('2d');

  if (context === null) {
    throw new Error('A 2D context is required to generate the probe texture.');
  }

  context.fillStyle = '#1d2b3a';
  context.fillRect(0, 0, size, size);
  context.strokeStyle = '#f2f5f7';
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(0, 0);
  context.lineTo(size, size);
  context.moveTo(size, 0);
  context.lineTo(0, size);
  context.stroke();
  context.fillStyle = '#ff8a3d';
  context.beginPath();
  context.moveTo(size, 0);
  context.lineTo(size, size * 0.45);
  context.lineTo(size * 0.55, 0);
  context.closePath();
  context.fill();

  return new Texture(canvas);
};

/** Solid 2×2 white texture the `overdraw` scene stretches over the whole stage. */
const createFlatTexture = (): Texture => {
  const canvas = document.createElement('canvas');

  canvas.width = 2;
  canvas.height = 2;

  const context = canvas.getContext('2d');

  if (context === null) {
    throw new Error('A 2D context is required to generate the probe texture.');
  }

  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, 2, 2);

  return new Texture(canvas);
};

/**
 * The content every non-overdraw scene shares: a raster sprite, a fan of
 * hairline diagonals, an outlined star, concentric rings and two sizes of small
 * SDF text.
 *
 * The hairlines are the point. A 1-unit stroke is one device pixel at DPR 1,
 * two at DPR 2 and three at DPR 3, so its rendered sharpness is a direct read of
 * the surface's real resolution — and, when the content sits behind an effect or
 * a texture cache, of the INTERNAL target's resolution instead.
 */
const buildSharpContent = (stageSize: number, withText: boolean): { node: Container; textures: Texture[]; spin: Graphics } => {
  const content = new Container();
  const edgeTexture = createEdgeTexture(64);
  const sprite = new Sprite(edgeTexture);

  sprite.setPosition(stageSize * 0.06, stageSize * 0.06);

  // A fan of 1-unit strokes from one origin: every line crosses the pixel grid
  // at a different angle, so at one glance you can see the angle at which the
  // rasterizer stops resolving them apart.
  const fan = new Graphics();

  fan.lineWidth = 1;
  fan.strokeStyle = new Color(120, 220, 255);

  for (let i = 0; i <= 8; i++) {
    const t = i / 8;

    fan.drawLine(stageSize * 0.06, stageSize * 0.46, stageSize * 0.52, stageSize * (0.32 + t * 0.28));
  }

  // Concentric 1-unit rings 3 units apart: the classic resolution target. At
  // DPR 1 the inner rings merge into a disc; each extra device pixel per logical
  // unit pushes that merge point inward by a visible step.
  const rings = new Graphics();

  rings.lineWidth = 1;
  rings.strokeStyle = new Color(150, 235, 190);

  for (let i = 1; i <= 10; i++) {
    rings.drawCircle(stageSize * 0.74, stageSize * 0.46, i * 3);
  }

  const spin = new Graphics();

  spin.lineWidth = 1;
  spin.strokeStyle = new Color(255, 208, 96);
  spin.drawStar(0, 0, 9, stageSize * 0.15, stageSize * 0.06);
  spin.drawCircle(0, 0, stageSize * 0.16);
  spin.drawCircle(0, 0, stageSize * 0.11);
  spin.setPosition(stageSize * 0.72, stageSize * 0.2);

  content.addChild(sprite);
  content.addChild(fan);
  content.addChild(rings);
  content.addChild(spin);

  if (withText) {
    const caption = new Text('Fan, rings and star are vector geometry.', {
      fontSize: 11,
      fillColor: new Color(232, 238, 244),
      maxWidth: stageSize * 0.86,
    });

    caption.setPosition(stageSize * 0.06, stageSize * 0.72);

    const small = new Text('9px — the smallest legible size', {
      fontSize: 9,
      fillColor: new Color(180, 196, 210),
    });

    small.setPosition(stageSize * 0.06, stageSize * 0.88);

    content.addChild(caption);
    content.addChild(small);
  }

  return { node: content, textures: [edgeTexture], spin };
};

/** Build the `overdraw` scene: `OVERDRAW_LAYERS` full-stage quads at low alpha. */
const buildOverdrawScene = (stageSize: number): ProbeScene => {
  const root = new Container();
  const texture = createFlatTexture();
  const layers: Sprite[] = [];

  for (let i = 0; i < OVERDRAW_LAYERS; i++) {
    const layer = new Sprite(texture);

    layer.width = stageSize;
    layer.height = stageSize;
    layer.setPosition(0, 0);
    layer.setTint(new Color(40 + ((i * 9) % 200), 90, 200 - ((i * 7) % 160), 0.25));
    root.addChild(layer);
    layers.push(layer);
  }

  return {
    root,
    cacheNodes: [],
    update(frame: number): void {
      // A one-unit wobble so the frame is never a literal repeat of the last —
      // it changes no fill-rate property, it only stops a driver from treating
      // the surface as unchanged.
      const dx = Math.sin(frame * 0.15);

      for (let i = 0; i < layers.length; i++) {
        layers[i]!.setPosition(dx * ((i % 3) - 1), 0);
      }
    },
    dispose(): void {
      root.destroy();
      texture.destroy();
    },
  };
};

/**
 * Build one probe scene.
 *
 * `cache-texture` is deliberately the only STATIC scene: a texture cache exists to
 * be baked once and replayed, and any per-frame mutation would change the node's
 * world bounds, invalidate the cache every frame and turn the scene into a
 * "re-bake a cache 60 times a second" benchmark — which is not what anyone runs
 * and not what `NEU-S4` is about. Its measured cost is therefore the REPLAY
 * cost, and its interesting column is sharpness, not milliseconds.
 *
 * It is also the only scene WITHOUT text, and not by preference. Measured while
 * building this probe (desktop Chromium, both backends, same page): a
 * `cacheAsTexture` container that contains a `Text` node draws NOTHING on WebGL2
 * — not the text and not its non-text siblings — while the identical scene
 * renders correctly on WebGPU, and while the same content behind a filter (no
 * cache) renders correctly on both. Since iOS Safari is always WebGL2, keeping
 * text here would have made the whole `cacheAsTexture` arm a black rectangle on
 * the device this probe exists for. The omission is stated in the run's notes
 * rather than quietly compensated for.
 */
export const createProbeScene = (id: ProbeSceneId, options: ProbeSceneOptions): ProbeScene => {
  const { stageSize, probeScale } = options;

  if (id === 'overdraw') {
    return buildOverdrawScene(stageSize);
  }

  const root = new Container();
  const { node: content, textures, spin } = buildSharpContent(stageSize, id !== 'cache-texture');
  const filters: Array<ColorFilter | BlurFilter> = [];

  root.addChild(content);

  if (id === 'color-filter') {
    const filter = new ColorFilter(new Color(255, 214, 170));

    filters.push(filter);
    content.filters = [filter];
  }

  if (id === 'blur') {
    // Radius is expressed in TARGET texels, so a probe-mode target that is
    // `probeScale` times larger would blur over `1 / probeScale` of the logical
    // width it does today. Scaling the radius with the target keeps the two arms
    // visually comparable; without it the probe arm would look sharper for a
    // reason that has nothing to do with resolution.
    const filter = new BlurFilter({ radius: BLUR_RADIUS * probeScale, quality: BLUR_QUALITY });

    filters.push(filter);
    content.filters = [filter];
  }

  const cacheNodes: RenderNode[] = [];

  if (id === 'cache-texture') {
    content.cacheAsTexture = true;
    cacheNodes.push(content);
  }

  const animated = id !== 'cache-texture';

  return {
    root,
    cacheNodes,
    update(frame: number): void {
      if (animated) {
        spin.setRotation(frame * 0.01);
      }
    },
    dispose(): void {
      root.destroy();

      for (const filter of filters) {
        filter.destroy();
      }

      for (const texture of textures) {
        texture.destroy();
      }
    },
  };
};
