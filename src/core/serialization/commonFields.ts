import { logger } from '#core/Logger';
import type { SceneNode } from '#core/SceneNode';
import { Rectangle } from '#math/Rectangle';
import { Drawable } from '#rendering/Drawable';
import { isPixelSnapMode, PixelSnapMode } from '#rendering/pixelSnap';
import { RenderNode } from '#rendering/RenderNode';
import { BlendModes } from '#rendering/types';

import { asNumberArray, readNumber } from './read';
import { arrayToColor } from './serializerHelpers';
import type { SerializedNode } from './types';

/**
 * Write the common `SceneNode` (+ `Drawable`) fields of `node` into `out`.
 *
 * Only non-default values are written, so a freshly-constructed node
 * contributes nothing here. Transforms are emitted in logical units
 * (px / degrees); the `Drawable` tint is `[r, g, b, a]` with `r/g/b` in 0..255
 * and `a` in 0..1. Runtime caches, matrices and dirty flags are never written.
 */
export const writeCommonFields = (node: SceneNode, out: SerializedNode): void => {
  if (node.x !== 0) {
    out.x = node.x;
  }

  if (node.y !== 0) {
    out.y = node.y;
  }

  if (node.rotation !== 0) {
    out.rotation = node.rotation;
  }

  if (node.scale.x !== 1) {
    out.scaleX = node.scale.x;
  }

  if (node.scale.y !== 1) {
    out.scaleY = node.scale.y;
  }

  if (node.skewX !== 0) {
    out.skewX = node.skewX;
  }

  if (node.skewY !== 0) {
    out.skewY = node.skewY;
  }

  if (node.origin.x !== 0) {
    out.originX = node.origin.x;
  }

  if (node.origin.y !== 0) {
    out.originY = node.origin.y;
  }

  if (!node.visible) {
    out.visible = false;
  }

  if (node.zIndex !== 0) {
    out.zIndex = node.zIndex;
  }

  if (node.name !== null) {
    out.name = node.name;
  }

  if (node instanceof RenderNode) {
    if (!node.cullable) {
      out.cullable = false;
    }

    if (node.cullArea !== null) {
      out.cullArea = [node.cullArea.x, node.cullArea.y, node.cullArea.width, node.cullArea.height];
    }

    if (node.interactive) {
      out.interactive = true;
    }

    if (node.draggable) {
      out.draggable = true;
    }

    if (node.focusable) {
      out.focusable = true;
    }

    if (node.tabIndex !== 0) {
      out.tabIndex = node.tabIndex;
    }

    if (node.cursor !== null) {
      out.cursor = node.cursor;
    }

    if (node.clip) {
      out.clip = true;
    }

    if (node.preserveDrawOrder) {
      out.preserveDrawOrder = true;
    }

    if (node.cacheAsTexture) {
      out.cacheAsTexture = true;
    }

    const clipShape = node.clipShape;

    if (clipShape instanceof Rectangle) {
      out.clipShape = [clipShape.x, clipShape.y, clipShape.width, clipShape.height];
    } else if (clipShape !== null) {
      logger.warn('A Geometry clipShape is not serialized (deferred); the deserialized node clips to its bounds instead.', {
        source: 'serialize',
        once: 'serialize:geometry-clipshape',
      });
    }
  }

  if (node instanceof Drawable) {
    const tint = node.tint;

    if (tint.r !== 255 || tint.g !== 255 || tint.b !== 255 || tint.a !== 1) {
      out.tint = [tint.r, tint.g, tint.b, tint.a];
    }

    if (node.blendMode !== BlendModes.Normal) {
      out.blendMode = node.blendMode;
    }

    if (node.pixelSnapMode !== PixelSnapMode.None) {
      out.pixelSnapMode = node.pixelSnapMode;
    }

    // The anchor is written alongside the origin it derives, not instead of
    // it. A node that resolves its layout box lazily (an AnimatedSprite whose
    // frames differ in size) has to know it is anchored before it can re-derive
    // the origin for a new box; an origin restored on its own leaves the anchor
    // at (0, 0) and the pivot goes stale on the next frame change.
    if (node.anchor.x !== 0) {
      out.anchorX = node.anchor.x;
    }

    if (node.anchor.y !== 0) {
      out.anchorY = node.anchor.y;
    }
  }
};

/**
 * Apply the common fields from `data` onto an already-constructed `node`.
 *
 * Called by the framework after a {@link NodeSerializer.read} returns, so it
 * overrides any transform side-effects of construction (e.g. a `Sprite` frame
 * resetting scale). Absent fields keep the node's constructed defaults.
 */
export const applyCommonFields = (node: SceneNode, data: SerializedNode): void => {
  const x = readNumber(data, 'x');

  if (x !== undefined) {
    node.x = x;
  }

  const y = readNumber(data, 'y');

  if (y !== undefined) {
    node.y = y;
  }

  const rotation = readNumber(data, 'rotation');

  if (rotation !== undefined) {
    node.rotation = rotation;
  }

  const scaleX = readNumber(data, 'scaleX');

  if (scaleX !== undefined) {
    node.scale.x = scaleX;
  }

  const scaleY = readNumber(data, 'scaleY');

  if (scaleY !== undefined) {
    node.scale.y = scaleY;
  }

  const skewX = readNumber(data, 'skewX');

  if (skewX !== undefined) {
    node.skewX = skewX;
  }

  const skewY = readNumber(data, 'skewY');

  if (skewY !== undefined) {
    node.skewY = skewY;
  }

  // The anchor is applied BEFORE the origin, and deliberately so: writing the
  // anchor re-derives the origin from the layout box, so an origin that was
  // stored explicitly has to be written afterwards to win. Applying it the
  // other way round would let the anchor silently overwrite a pivot the
  // document recorded.
  if (node instanceof Drawable) {
    const anchorX = readNumber(data, 'anchorX', 0);
    const anchorY = readNumber(data, 'anchorY', 0);

    if (anchorX !== 0 || anchorY !== 0) {
      node.anchor.set(anchorX, anchorY);
    }
  }

  const originX = readNumber(data, 'originX');

  if (originX !== undefined) {
    node.origin.x = originX;
  }

  const originY = readNumber(data, 'originY');

  if (originY !== undefined) {
    node.origin.y = originY;
  }

  if (data.visible === false) {
    node.visible = false;
  }

  const zIndex = readNumber(data, 'zIndex');

  if (zIndex !== undefined) {
    node.zIndex = zIndex;
  }

  if (typeof data.name === 'string') {
    node.name = data.name;
  }

  if (node instanceof RenderNode) {
    if (data.cullable === false) {
      node.cullable = false;
    }

    const cullArea = asNumberArray(data.cullArea);

    if (cullArea?.length === 4) {
      node.cullArea = new Rectangle(cullArea[0] ?? 0, cullArea[1] ?? 0, cullArea[2] ?? 0, cullArea[3] ?? 0);
    }

    if (data.interactive === true) {
      node.interactive = true;
    }

    if (data.draggable === true) {
      node.draggable = true;
    }

    if (data.focusable === true) {
      node.focusable = true;
    }

    const tabIndex = readNumber(data, 'tabIndex');

    if (tabIndex !== undefined) {
      node.tabIndex = tabIndex;
    }

    if (typeof data.cursor === 'string') {
      node.cursor = data.cursor;
    }

    if (data.clip === true) {
      node.clip = true;
    }

    if (data.preserveDrawOrder === true) {
      node.preserveDrawOrder = true;
    }

    if (data.cacheAsTexture === true) {
      node.cacheAsTexture = true;
    }

    const clipShape = asNumberArray(data.clipShape);

    if (clipShape?.length === 4) {
      node.clipShape = new Rectangle(clipShape[0] ?? 0, clipShape[1] ?? 0, clipShape[2] ?? 0, clipShape[3] ?? 0);
    }
  }

  if (node instanceof Drawable) {
    const tint = arrayToColor(data.tint);

    if (tint !== undefined) {
      node.tint = tint;
    }

    if (typeof data.blendMode === 'number') {
      node.blendMode = data.blendMode;
    }

    if (typeof data.pixelSnapMode === 'number' && isPixelSnapMode(data.pixelSnapMode)) {
      node.pixelSnapMode = data.pixelSnapMode;
    }
  }
};
