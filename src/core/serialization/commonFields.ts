import { Color } from '#core/Color';
import { warnOnce } from '#core/dev';
import type { SceneNode } from '#core/SceneNode';
import { Rectangle } from '#math/Rectangle';
import { Drawable } from '#rendering/Drawable';
import { isPixelSnapMode } from '#rendering/pixelSnap';
import { RenderNode } from '#rendering/RenderNode';
import { BlendModes } from '#rendering/types';

import type { SerializedNode } from './types';

/**
 * Write the common `SceneNode` (+ `Drawable`) fields of `node` into `out`.
 *
 * Only non-default values are written, so a freshly-constructed node
 * contributes nothing here. Transforms are emitted in logical units
 * (px / degrees); the `Drawable` tint is `[r, g, b, a]` with `r/g/b` in 0..255
 * and `a` in 0..1. Runtime caches, matrices and dirty flags are never written.
 */
export function writeCommonFields(node: SceneNode, out: SerializedNode): void {
  if (node.x !== 0) out.x = node.x;
  if (node.y !== 0) out.y = node.y;
  if (node.rotation !== 0) out.rotation = node.rotation;
  if (node.scale.x !== 1) out.scaleX = node.scale.x;
  if (node.scale.y !== 1) out.scaleY = node.scale.y;
  if (node.skewX !== 0) out.skewX = node.skewX;
  if (node.skewY !== 0) out.skewY = node.skewY;
  if (node.origin.x !== 0) out.originX = node.origin.x;
  if (node.origin.y !== 0) out.originY = node.origin.y;
  if (!node.visible) out.visible = false;
  if (node.zIndex !== 0) out.zIndex = node.zIndex;
  if (!node.cullable) out.cullable = false;
  if (node.cullArea !== null) out.cullArea = [node.cullArea.x, node.cullArea.y, node.cullArea.width, node.cullArea.height];
  if (node.name !== null) out.name = node.name;

  if (node instanceof RenderNode) {
    if (node.interactive) out.interactive = true;
    if (node.draggable) out.draggable = true;
    if (node.focusable) out.focusable = true;
    if (node.tabIndex !== 0) out.tabIndex = node.tabIndex;
    if (node.cursor !== null) out.cursor = node.cursor;
    if (node.clip) out.clip = true;
    if (node.preserveDrawOrder) out.preserveDrawOrder = true;
    if (node.cacheAsBitmap) out.cacheAsBitmap = true;

    const clipShape = node.clipShape;

    if (clipShape instanceof Rectangle) {
      out.clipShape = [clipShape.x, clipShape.y, clipShape.width, clipShape.height];
    } else if (clipShape !== null) {
      warnOnce('serialize:geometry-clipshape', 'A Geometry clipShape is not serialized (deferred); the deserialized node clips to its bounds instead.');
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

    if (node.pixelSnapMode !== 'none') {
      out.pixelSnapMode = node.pixelSnapMode;
    }
  }
}

/**
 * Apply the common fields from `data` onto an already-constructed `node`.
 *
 * Called by the framework after a {@link NodeSerializer.read} returns, so it
 * overrides any transform side-effects of construction (e.g. a `Sprite` frame
 * resetting scale). Absent fields keep the node's constructed defaults.
 */
export function applyCommonFields(node: SceneNode, data: SerializedNode): void {
  if (typeof data.x === 'number') node.x = data.x;
  if (typeof data.y === 'number') node.y = data.y;
  if (typeof data.rotation === 'number') node.rotation = data.rotation;
  if (typeof data.scaleX === 'number') node.scale.x = data.scaleX;
  if (typeof data.scaleY === 'number') node.scale.y = data.scaleY;
  if (typeof data.skewX === 'number') node.skewX = data.skewX;
  if (typeof data.skewY === 'number') node.skewY = data.skewY;
  if (typeof data.originX === 'number') node.origin.x = data.originX;
  if (typeof data.originY === 'number') node.origin.y = data.originY;
  if (data.visible === false) node.visible = false;
  if (typeof data.zIndex === 'number') node.zIndex = data.zIndex;
  if (data.cullable === false) node.cullable = false;

  const cullArea = data.cullArea;

  if (Array.isArray(cullArea) && cullArea.length === 4) {
    node.cullArea = new Rectangle(Number(cullArea[0]), Number(cullArea[1]), Number(cullArea[2]), Number(cullArea[3]));
  }

  if (typeof data.name === 'string') node.name = data.name;

  if (node instanceof RenderNode) {
    if (data.interactive === true) node.interactive = true;
    if (data.draggable === true) node.draggable = true;
    if (data.focusable === true) node.focusable = true;
    if (typeof data.tabIndex === 'number') node.tabIndex = data.tabIndex;
    if (typeof data.cursor === 'string') node.cursor = data.cursor;
    if (data.clip === true) node.clip = true;
    if (data.preserveDrawOrder === true) node.preserveDrawOrder = true;
    if (data.cacheAsBitmap === true) node.cacheAsBitmap = true;

    const clipShape = data.clipShape;

    if (Array.isArray(clipShape) && clipShape.length === 4) {
      node.clipShape = new Rectangle(Number(clipShape[0]), Number(clipShape[1]), Number(clipShape[2]), Number(clipShape[3]));
    }
  }

  if (node instanceof Drawable) {
    const tint = data.tint;

    if (Array.isArray(tint) && tint.length === 4) {
      node.tint = new Color(Number(tint[0]), Number(tint[1]), Number(tint[2]), Number(tint[3]));
    }

    if (typeof data.blendMode === 'number') {
      node.blendMode = data.blendMode;
    }

    if (typeof data.pixelSnapMode === 'string' && isPixelSnapMode(data.pixelSnapMode)) {
      node.pixelSnapMode = data.pixelSnapMode;
    }
  }
}
