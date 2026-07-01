import { warnOnce } from '#core/dev';
import { Rectangle } from '#math/Rectangle';
import { Mesh } from '#rendering/mesh/Mesh';
import { Graphics } from '#rendering/primitives/Graphics';
import type { RenderNode } from '#rendering/RenderNode';
import { AnimatedSprite, type AnimatedSpriteClipDefinition } from '#rendering/sprite/AnimatedSprite';
import type { NineSliceInsets, NineSliceModes } from '#rendering/sprite/nineSlice';
import { NineSliceSprite } from '#rendering/sprite/NineSliceSprite';
import { RepeatingSprite } from '#rendering/sprite/RepeatingSprite';
import { BitmapText } from '#rendering/text/BitmapText';
import { BmFont } from '#rendering/text/BmFont';
import { Texture } from '#rendering/texture/Texture';
import { Video } from '#rendering/video/Video';

import type { NodeSerializer } from './NodeSerializer';
import { asNumberArray, asObject, asSerializedNode, readBoolean, readEnum, REPEAT_FITS, REPEAT_MODES } from './read';
import type { SerializationRegistry } from './SerializationRegistry';
import { compact, deserializeStyleOptions, readLayoutOptions, serializeStyle } from './serializerHelpers';

// ── Small helpers ────────────────────────────────────────────────────────────

const toF32 = (value: unknown): Float32Array => (Array.isArray(value) ? new Float32Array(value.map(Number)) : new Float32Array());
const toU16 = (value: unknown): Uint16Array => (Array.isArray(value) ? new Uint16Array(value.map(Number)) : new Uint16Array());
const toU32 = (value: unknown): Uint32Array => (Array.isArray(value) ? new Uint32Array(value.map(Number)) : new Uint32Array());
const num = (value: unknown): number | undefined => (typeof value === 'number' && Number.isFinite(value) ? value : undefined);

/** Read a {@link NineSliceInsets} from JSON, defaulting any missing/invalid edge to 0 (never `undefined` — `slices` is required and `undefined` would crash `normalizeInsets`). */
const readInsets = (value: unknown): NineSliceInsets => {
  const source = asObject(value);

  return {
    left: num(source?.left) ?? 0,
    top: num(source?.top) ?? 0,
    right: num(source?.right) ?? 0,
    bottom: num(source?.bottom) ?? 0,
  };
};

/** Read {@link NineSliceModes} from JSON, keeping only valid enum fields (invalid ones fall back to the renderer's defaults). */
const readModes = (value: unknown): NineSliceModes | undefined => {
  const source = asObject(value);

  if (source === null) {
    return undefined;
  }

  const out: { -readonly [K in keyof NineSliceModes]: NineSliceModes[K] } = {};

  const edges = readEnum(source, 'edges', REPEAT_MODES);
  if (edges !== undefined) out.edges = edges;
  const center = readEnum(source, 'center', REPEAT_MODES);
  if (center !== undefined) out.center = center;
  const top = readEnum(source, 'top', REPEAT_MODES);
  if (top !== undefined) out.top = top;
  const right = readEnum(source, 'right', REPEAT_MODES);
  if (right !== undefined) out.right = right;
  const bottom = readEnum(source, 'bottom', REPEAT_MODES);
  if (bottom !== undefined) out.bottom = bottom;
  const left = readEnum(source, 'left', REPEAT_MODES);
  if (left !== undefined) out.left = left;
  const edgeFit = readEnum(source, 'edgeFit', REPEAT_FITS);
  if (edgeFit !== undefined) out.edgeFit = edgeFit;
  const centerFit = readEnum(source, 'centerFit', REPEAT_FITS);
  if (centerFit !== undefined) out.centerFit = centerFit;

  return out;
};

// ── Mesh ─────────────────────────────────────────────────────────────────────

const meshSerializer: NodeSerializer<Mesh> = {
  write(node, ctx) {
    const out: Record<string, unknown> = { vertices: [...node.vertices] };

    if (node.indices !== null) out.indices = [...node.indices];
    if (node.uvs !== null) out.uvs = [...node.uvs];
    if (node.colors !== null) out.colors = [...node.colors];

    const source = ctx.keyFor(node.texture);
    if (source !== null) out.texture = source;

    if (node.material !== null) {
      warnOnce('serialize:mesh-material', 'Mesh.material is not serialized (custom materials are deferred); the deserialized mesh uses the default material.');
    }

    return out;
  },
  read(data, ctx) {
    return new Mesh(
      compact({
        vertices: toF32(data.vertices),
        indices: data.indices !== undefined ? toU16(data.indices) : undefined,
        uvs: data.uvs !== undefined ? toF32(data.uvs) : undefined,
        colors: data.colors !== undefined ? toU32(data.colors) : undefined,
        texture: ctx.resolveAsset(typeof data.texture === 'string' ? data.texture : null, Texture),
      }),
    );
  },
};

// ── Graphics ───────────────────────────────────────────────────────────────
// Graphics is immediate-mode: its authored result is the baked Mesh children it
// accumulates. Round-trips the rendered geometry (gradient fills, drawn via
// runtime DataTextures, degrade to their vertex colours — texture refs are
// unkeyed and dropped). The pen state is transient and not serialized.

const graphicsSerializer: NodeSerializer<Graphics> = {
  write(node, ctx) {
    if (node.children.length === 0) {
      return {};
    }

    return { children: node.children.map(child => ctx.writeNode(child)) };
  },
  read(data, ctx) {
    const node = new Graphics();
    const children = data.children;

    if (Array.isArray(children)) {
      for (const child of children) {
        const childNode = asSerializedNode(child);
        if (childNode !== null) node.addChild(ctx.readNode(childNode) as RenderNode);
      }
    }

    return node;
  },
};

// ── NineSliceSprite ──────────────────────────────────────────────────────────

const nineSliceSerializer: NodeSerializer<NineSliceSprite> = {
  write(node, ctx) {
    const out: Record<string, unknown> = {
      slices: { ...node.slices },
      border: { ...node.border },
      modes: { ...node.modes },
      width: node.width,
      height: node.height,
    };

    const source = ctx.keyFor(node.texture);
    if (source !== null) out.texture = source;

    return out;
  },
  read(data, ctx) {
    const texture = ctx.resolveAsset(typeof data.texture === 'string' ? data.texture : null, Texture);

    if (texture === null) {
      throw new Error('NineSliceSprite deserialize requires its texture to be pre-loaded into the Loader.');
    }

    return new NineSliceSprite(
      texture,
      compact({
        slices: readInsets(data.slices),
        border: asObject(data.border) !== null ? readInsets(data.border) : undefined,
        modes: readModes(data.modes),
        width: num(data.width),
        height: num(data.height),
      }),
    );
  },
};

// ── RepeatingSprite ──────────────────────────────────────────────────────────

const repeatingSerializer: NodeSerializer<RepeatingSprite> = {
  write(node, ctx) {
    const out: Record<string, unknown> = {
      width: node.width,
      height: node.height,
      modeX: node.modeX,
      modeY: node.modeY,
      fitX: node.fitX,
      fitY: node.fitY,
      offsetX: node.offsetX,
      offsetY: node.offsetY,
    };

    const source = ctx.keyFor(node.texture);
    if (source !== null) out.texture = source;

    return out;
  },
  read(data, ctx) {
    const texture = ctx.resolveAsset(typeof data.texture === 'string' ? data.texture : null, Texture);

    if (texture === null) {
      throw new Error('RepeatingSprite deserialize requires its texture to be pre-loaded into the Loader.');
    }

    return new RepeatingSprite(
      texture,
      compact({
        width: num(data.width),
        height: num(data.height),
        modeX: readEnum(data, 'modeX', REPEAT_MODES),
        modeY: readEnum(data, 'modeY', REPEAT_MODES),
        fitX: readEnum(data, 'fitX', REPEAT_FITS),
        fitY: readEnum(data, 'fitY', REPEAT_FITS),
        offsetX: num(data.offsetX),
        offsetY: num(data.offsetY),
      }),
    );
  },
};

// ── AnimatedSprite ───────────────────────────────────────────────────────────
// Clips round-trip fully; playback resumes at the active clip's first frame
// (the exact current frame / elapsed time is runtime state and not restored).

const animatedSpriteSerializer: NodeSerializer<AnimatedSprite> = {
  write(node, ctx) {
    const out: Record<string, unknown> = {};

    const source = ctx.keyFor(node.texture);
    if (source !== null) out.texture = source;

    const clips: Record<string, unknown> = {};

    for (const [name, clip] of Object.entries(node._getClipDefinitions())) {
      clips[name] = compact({
        frames: clip.frames.map(frame => [frame.x, frame.y, frame.width, frame.height]),
        fps: clip.fps,
        loop: clip.loop,
        frameDurations: clip.frameDurations ? [...clip.frameDurations] : undefined,
      });
    }

    out.clips = clips;

    if (node.currentClip !== null) out.currentClip = node.currentClip;
    if (node.playing) out.playing = true;

    return out;
  },
  read(data, ctx) {
    const texture = ctx.resolveAsset(typeof data.texture === 'string' ? data.texture : null, Texture);
    const clips: Record<string, AnimatedSpriteClipDefinition> = {};
    const clipsData = data.clips;

    const clipsObject = asObject(clipsData);

    if (clipsObject !== null) {
      for (const [name, raw] of Object.entries(clipsObject)) {
        const clip = asObject(raw);

        if (clip === null) {
          continue;
        }

        const frames = Array.isArray(clip.frames)
          ? clip.frames.map(frame => {
              const values = asNumberArray(frame) ?? [];

              return new Rectangle(values[0] ?? 0, values[1] ?? 0, values[2] ?? 0, values[3] ?? 0);
            })
          : [];

        const frameDurations = Array.isArray(clip.frameDurations) ? (asNumberArray(clip.frameDurations) ?? undefined) : undefined;

        clips[name] = compact({ frames, fps: num(clip.fps), loop: readBoolean(clip, 'loop'), frameDurations });
      }
    }

    const sprite = new AnimatedSprite(texture, clips);

    if (typeof data.currentClip === 'string' && data.currentClip in clips) {
      sprite.play(data.currentClip);

      if (data.playing !== true) {
        sprite.pause();
      }
    }

    return sprite;
  },
};

// ── BitmapText ─────────────────────────────────────────────────────────────

const bitmapTextSerializer: NodeSerializer<BitmapText> = {
  write(node, ctx) {
    const out: Record<string, unknown> = { text: node.text };

    const source = ctx.keyFor(node.font);
    if (source !== null) out.font = source;

    if (node.msdf) out.msdf = true;
    if (node.fontScale !== 1) out.scale = node.fontScale;

    const style = serializeStyle(node.style);
    if (style !== undefined) out.style = style;
    if (Object.keys(node.layout).length > 0) out.layout = { ...node.layout };

    return out;
  },
  read(data, ctx) {
    const font = ctx.resolveAsset(typeof data.font === 'string' ? data.font : null, BmFont);

    if (font === null) {
      throw new Error('BitmapText deserialize requires its BmFont to be pre-loaded into the Loader.');
    }

    const layout = readLayoutOptions(data.layout);

    return new BitmapText(
      typeof data.text === 'string' ? data.text : '',
      font,
      compact({
        ...deserializeStyleOptions(data.style),
        msdf: data.msdf === true,
        scale: num(data.scale),
        layout,
      }),
    );
  },
};

// ── Video ────────────────────────────────────────────────────────────────────
// Captures the source URL + playback options. Deserialize creates a fresh
// `<video>` element (requires a DOM); the live decode/audio graph is rebuilt by
// the Video constructor.

const videoSerializer: NodeSerializer<Video> = {
  write(node) {
    const out: Record<string, unknown> = { src: node.videoElement.src };

    if (node.volume !== 1) out.volume = node.volume;
    if (node.loop) out.loop = true;
    if (node.playbackRate !== 1) out.playbackRate = node.playbackRate;
    if (node.muted) out.muted = true;
    if (node.currentTime > 0) out.time = node.currentTime;

    return out;
  },
  read(data) {
    const element = document.createElement('video');

    if (typeof data.src === 'string') {
      element.src = data.src;
    }

    return new Video(
      element,
      compact({
        volume: num(data.volume),
        loop: data.loop === true ? true : undefined,
        playbackRate: num(data.playbackRate),
        muted: data.muted === true ? true : undefined,
        time: num(data.time),
      }),
    );
  },
};

/**
 * Register the rendering-package node serializers on `registry`.
 * @internal
 */
export function registerRenderingSerializers(registry: SerializationRegistry): void {
  registry.register('Mesh', Mesh, meshSerializer);
  registry.register('Graphics', Graphics, graphicsSerializer);
  registry.register('NineSliceSprite', NineSliceSprite, nineSliceSerializer);
  registry.register('RepeatingSprite', RepeatingSprite, repeatingSerializer);
  registry.register('AnimatedSprite', AnimatedSprite, animatedSpriteSerializer);
  registry.register('BitmapText', BitmapText, bitmapTextSerializer);
  registry.register('Video', Video, videoSerializer);
}
