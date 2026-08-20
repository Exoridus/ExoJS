import type { SceneNode } from '#core/SceneNode';
import type { Container } from '#rendering/Container';
import type { Drawable } from '#rendering/Drawable';
import type { RenderNode } from '#rendering/RenderNode';
import type { Sprite } from '#rendering/sprite/Sprite';
import type { Widget } from '#ui/Widget';

declare const node: SceneNode;
declare const renderNode: RenderNode;
declare const container: Container;
declare const widget: Widget;
declare const drawable: Drawable;
declare const sprite: Sprite;

// The normalized `anchor` derives `origin` from a LAYOUT BOX. A node that
// carries no geometry of its own has no box to measure - a container's local
// rect is the empty 0x0 box at its own origin - so an anchor there always
// computed (0, 0) and was a silent no-op. It lives on `Drawable` only.

// @ts-expect-error - SceneNode has no anchor
const nodeAnchor: unknown = node.anchor;
// @ts-expect-error - SceneNode has no setAnchor
node.setAnchor(0.5, 0.5);
// @ts-expect-error - RenderNode has no anchor
const renderNodeAnchor: unknown = renderNode.anchor;
// @ts-expect-error - RenderNode has no setAnchor
renderNode.setAnchor(0.5, 0.5);
// @ts-expect-error - Container has no anchor
const containerAnchor: unknown = container.anchor;
// @ts-expect-error - Container has no setAnchor
container.setAnchor(0.5, 0.5);
// @ts-expect-error - Widget has no anchor (it has anchorIn(), a different thing)
const widgetAnchor: unknown = widget.anchor;
// @ts-expect-error - Widget has no setAnchor
widget.setAnchor(0.5, 0.5);

// `origin` stays on SceneNode: every node can carry an explicit pivot.
const originX: number = node.origin.x;
const containerOrigin: number = container.origin.y;

node.setOrigin(4, 5);
container.setOrigin(4, 5);

// Drawables and their subclasses keep the anchor.
const anchorX: number = drawable.anchor.x;
const spriteAnchorY: number = sprite.anchor.y;

drawable.setAnchor(0.5, 0.5);
sprite.setAnchor(0.5);

// Widget keeps its own screen-edge anchoring, which is unrelated.
const anchorIn: Widget['anchorIn'] = widget.anchorIn;

export { anchorIn, anchorX, containerAnchor, containerOrigin, nodeAnchor, originX, renderNodeAnchor, spriteAnchorY, widgetAnchor };
