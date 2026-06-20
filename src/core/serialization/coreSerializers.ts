import { warnOnce } from '#core/dev';
import { Rectangle } from '#math/Rectangle';
import { Container } from '#rendering/Container';
import type { RenderNode } from '#rendering/RenderNode';
import { Sprite } from '#rendering/sprite/Sprite';
import type { LayoutOptions } from '#rendering/text/LayoutOptions';
import { SDF_RADIUS, Text } from '#rendering/text/Text';
import { Texture } from '#rendering/texture/Texture';

import type { NodeSerializer } from './NodeSerializer';
import { registerRenderingSerializers } from './renderingSerializers';
import type { SerializationRegistry } from './SerializationRegistry';
import { deserializeStyleOptions, serializeStyle } from './serializerHelpers';
import type { SerializedNode } from './types';

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
    const layout = typeof data.layout === 'object' && data.layout !== null ? (data.layout as LayoutOptions) : undefined;

    return new Text(typeof data.text === 'string' ? data.text : '', deserializeStyleOptions(data.style), layout, {
      colorGlyphs: data.colorGlyphs === true,
      sdfRadius: typeof data.sdfRadius === 'number' ? data.sdfRadius : undefined,
    });
  },
};

/**
 * Register all built-in node serializers (core leaf types + rendering package)
 * on `registry`. Called once, lazily, from the serialization framework. UI
 * widgets are not yet covered (they need read-accessors for their authored
 * options) — see the Phase 4C follow-up.
 * @internal
 */
export function registerCoreSerializers(registry: SerializationRegistry): void {
  registry.register('Container', Container, containerSerializer);
  registry.register('Sprite', Sprite, spriteSerializer);
  registry.register('Text', Text, textSerializer);

  registerRenderingSerializers(registry);
}
