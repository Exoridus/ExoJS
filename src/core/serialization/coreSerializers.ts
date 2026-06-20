import { Color } from '#core/Color';
import { warnOnce } from '#core/dev';
import { Rectangle } from '#math/Rectangle';
import { Container } from '#rendering/Container';
import type { RenderNode } from '#rendering/RenderNode';
import { Sprite } from '#rendering/sprite/Sprite';
import type { LayoutOptions } from '#rendering/text/LayoutOptions';
import { SDF_RADIUS, Text } from '#rendering/text/Text';
import type { FontWeight, TextStyleOptions } from '#rendering/text/TextStyle';
import { TextStyle } from '#rendering/text/TextStyle';
import type { TextAlignment } from '#rendering/text/types';
import { Texture } from '#rendering/texture/Texture';

import type { NodeSerializer } from './NodeSerializer';
import type { SerializationRegistry } from './SerializationRegistry';
import type { SerializedNode } from './types';

// ── Color helpers ──────────────────────────────────────────────────────────

/** Serialize a colour to `[r, g, b, a]` (r/g/b 0..255, a 0..1). */
const colorToArray = (color: Color): [number, number, number, number] => [color.r, color.g, color.b, color.a];

/** Deserialize a `[r, g, b, a]` tuple back to a {@link Color}, or `undefined`. */
const arrayToColor = (value: unknown): Color | undefined =>
  Array.isArray(value) && value.length === 4 ? new Color(Number(value[0]), Number(value[1]), Number(value[2]), Number(value[3])) : undefined;

const colorEquals = (color: Color, r: number, g: number, b: number, a: number): boolean => color.r === r && color.g === g && color.b === b && color.a === a;

// ── Container ────────────────────────────────────────────────────────────────

const containerSerializer: NodeSerializer<Container> = {
  write(node, ctx) {
    if (node.children.length === 0) {
      return {};
    }

    return { children: node.children.map(child => ctx.writeNode(child)) };
  },
  read(data, ctx) {
    const node = new Container();
    const children = data.children;

    if (Array.isArray(children)) {
      for (const child of children) {
        node.addChild(ctx.readNode(child as SerializedNode) as RenderNode);
      }
    }

    return node;
  },
};

// ── Sprite ─────────────────────────────────────────────────────────────────

const spriteSerializer: NodeSerializer<Sprite> = {
  write(node, ctx) {
    const out: Record<string, unknown> = {};
    const source = ctx.keyFor(node.texture);

    if (source !== null) {
      out.texture = source;
    }

    if (node.material !== null) {
      warnOnce(
        'serialize:sprite-material',
        'Sprite.material is not serialized (custom materials are deferred); the deserialized sprite falls back to the default material.',
      );
    }

    const texture = node.texture;
    const frame = node.textureFrame;

    // Emit the frame only for sub-regions (spritesheets); a full-texture frame
    // is reconstructed for free by `new Sprite(texture)`.
    if (texture !== null && (frame.x !== 0 || frame.y !== 0 || frame.width !== texture.width || frame.height !== texture.height)) {
      out.frame = [frame.x, frame.y, frame.width, frame.height];
    }

    return out;
  },
  read(data, ctx) {
    const texture = ctx.resolveAsset(typeof data.texture === 'string' ? data.texture : null, Texture);
    const sprite = new Sprite(texture);
    const frame = data.frame;

    if (texture !== null && Array.isArray(frame) && frame.length === 4) {
      sprite.setTextureFrame(Rectangle.temp.set(Number(frame[0]), Number(frame[1]), Number(frame[2]), Number(frame[3])));
    }

    return sprite;
  },
};

// ── Text ─────────────────────────────────────────────────────────────────────

/** Serialize the plain-data fields of a {@link TextStyle}, omitting defaults. */
function serializeStyle(style: TextStyle): Record<string, unknown> | undefined {
  const out: Record<string, unknown> = {};

  if (style.fontFamily !== 'Arial') out.fontFamily = style.fontFamily;
  if (style.fontWeight !== 'normal') out.fontWeight = style.fontWeight;
  if (style.fontStyle !== 'normal') out.fontStyle = style.fontStyle;
  if (style.fontSize !== 20) out.fontSize = style.fontSize;
  if (!colorEquals(style.fillColor, 255, 255, 255, 1)) out.fillColor = colorToArray(style.fillColor);
  if (!colorEquals(style.outlineColor, 0, 0, 0, 1)) out.outlineColor = colorToArray(style.outlineColor);
  if (style.outlineWidth !== 0) out.outlineWidth = style.outlineWidth;
  if (style.align !== 'left') out.align = style.align;
  if (style.lineHeight !== 1.2) out.lineHeight = style.lineHeight;
  if (style.leading !== 0) out.leading = style.leading;
  if (!colorEquals(style.shadowColor, 0, 0, 0, 1)) out.shadowColor = colorToArray(style.shadowColor);
  if (style.shadowOffsetX !== 0) out.shadowOffsetX = style.shadowOffsetX;
  if (style.shadowOffsetY !== 0) out.shadowOffsetY = style.shadowOffsetY;
  if (style.shadowAlpha !== 0) out.shadowAlpha = style.shadowAlpha;
  if (style.shadowBlur !== 0) out.shadowBlur = style.shadowBlur;

  if (style.gradientColors !== null) {
    out.gradientColors = [colorToArray(style.gradientColors[0]), colorToArray(style.gradientColors[1])];
  }

  if (style.gradientAxis !== 'vertical') out.gradientAxis = style.gradientAxis;

  return Object.keys(out).length > 0 ? out : undefined;
}

/** Rebuild a {@link TextStyle} from serialized style data, or `undefined`. */
function deserializeStyle(data: unknown): TextStyle | undefined {
  if (typeof data !== 'object' || data === null) {
    return undefined;
  }

  const source = data as Record<string, unknown>;
  const options: TextStyleOptions = {};

  if (typeof source.fontFamily === 'string') options.fontFamily = source.fontFamily;
  if (typeof source.fontWeight === 'string') options.fontWeight = source.fontWeight as FontWeight;
  if (source.fontStyle === 'italic' || source.fontStyle === 'normal') options.fontStyle = source.fontStyle;
  if (typeof source.fontSize === 'number') options.fontSize = source.fontSize;

  const fillColor = arrayToColor(source.fillColor);
  if (fillColor !== undefined) options.fillColor = fillColor;

  const outlineColor = arrayToColor(source.outlineColor);
  if (outlineColor !== undefined) options.outlineColor = outlineColor;

  if (typeof source.outlineWidth === 'number') options.outlineWidth = source.outlineWidth;
  if (typeof source.align === 'string') options.align = source.align as TextAlignment;
  if (typeof source.lineHeight === 'number') options.lineHeight = source.lineHeight;
  if (typeof source.leading === 'number') options.leading = source.leading;

  const shadowColor = arrayToColor(source.shadowColor);
  if (shadowColor !== undefined) options.shadowColor = shadowColor;

  if (typeof source.shadowOffsetX === 'number') options.shadowOffsetX = source.shadowOffsetX;
  if (typeof source.shadowOffsetY === 'number') options.shadowOffsetY = source.shadowOffsetY;
  if (typeof source.shadowAlpha === 'number') options.shadowAlpha = source.shadowAlpha;
  if (typeof source.shadowBlur === 'number') options.shadowBlur = source.shadowBlur;

  if (Array.isArray(source.gradientColors) && source.gradientColors.length === 2) {
    const top = arrayToColor(source.gradientColors[0]);
    const bottom = arrayToColor(source.gradientColors[1]);

    if (top !== undefined && bottom !== undefined) {
      options.gradientColors = [top, bottom];
    }
  }

  if (source.gradientAxis === 'horizontal' || source.gradientAxis === 'vertical') {
    options.gradientAxis = source.gradientAxis;
  }

  return new TextStyle(options);
}

const textSerializer: NodeSerializer<Text> = {
  write(node) {
    const out: Record<string, unknown> = { text: node.text };
    const style = serializeStyle(node.style);

    if (style !== undefined) out.style = style;
    if (Object.keys(node.layout).length > 0) out.layout = { ...node.layout };
    if (node.colorGlyphs) out.colorGlyphs = true;
    if (node.sdfRadius !== SDF_RADIUS) out.sdfRadius = node.sdfRadius;

    return out;
  },
  read(data) {
    const style = deserializeStyle(data.style);
    const layout = typeof data.layout === 'object' && data.layout !== null ? (data.layout as LayoutOptions) : undefined;

    return new Text(typeof data.text === 'string' ? data.text : '', style, layout, {
      colorGlyphs: data.colorGlyphs === true,
      sdfRadius: typeof data.sdfRadius === 'number' ? data.sdfRadius : undefined,
    });
  },
};

/**
 * Register the built-in core node serializers (`Container`, `Sprite`, `Text`)
 * on `registry`. Called once, lazily, from the serialization framework.
 * @internal
 */
export function registerCoreSerializers(registry: SerializationRegistry): void {
  registry.register('Container', Container, containerSerializer);
  registry.register('Sprite', Sprite, spriteSerializer);
  registry.register('Text', Text, textSerializer);
}
