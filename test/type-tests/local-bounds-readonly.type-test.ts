import type { Matrix } from '#math/Matrix';
import { Rectangle } from '#math/Rectangle';
import type { Drawable } from '#rendering/Drawable';

declare const node: Drawable;
declare const matrix: Matrix;

// `SceneNode.getLocalBounds()` hands out the LIVE internal rectangle for zero
// allocation cost, so its return type is a read-only view: writing through it
// would silently skip the bounds/content invalidation the engine needs.
// Engine-internal writers go through `setLocalBounds` instead.

// @ts-expect-error - the read-only bounds view has no set()
node.getLocalBounds().set(0, 0, 16, 16);
// @ts-expect-error - the read-only bounds view has no setPosition()
node.getLocalBounds().setPosition(1, 2);
// @ts-expect-error - the read-only bounds view has no setSize()
node.getLocalBounds().setSize(1, 2);
// @ts-expect-error - the read-only bounds view has no copy()
node.getLocalBounds().copy(new Rectangle(0, 0, 1, 1));
// @ts-expect-error - the read-only bounds view has no destroy()
node.getLocalBounds().destroy();
// @ts-expect-error - x is read-only on the bounds view
node.getLocalBounds().x = 4;
// @ts-expect-error - width is read-only on the bounds view
node.getLocalBounds().width = 4;
// @ts-expect-error - transform() may not default to mutating the view in place
node.getLocalBounds().transform(matrix);

// Reads must keep working unchanged.
const x: number = node.getLocalBounds().x;
const y: number = node.getLocalBounds().y;
const width: number = node.getLocalBounds().width;
const height: number = node.getLocalBounds().height;
const left: number = node.getLocalBounds().left;
const top: number = node.getLocalBounds().top;
const right: number = node.getLocalBounds().right;
const bottom: number = node.getLocalBounds().bottom;
const hit: boolean = node.getLocalBounds().contains(1, 2);
const same: boolean = node.getLocalBounds().equals({ x: 0, y: 0, width: 1, height: 1 });
const copied: Rectangle = node.getLocalBounds().clone();
const boxed: Rectangle = node.getLocalBounds().getBounds();
// An explicit `result` target keeps `transform()` non-mutating for the view.
const mapped: Rectangle = node.getLocalBounds().transform(matrix, Rectangle.temp);

// The engine-internal writer takes flat coordinates and owns the invalidation.
node.setLocalBounds(0, 0, 16, 16);

export { bottom, boxed, copied, height, hit, left, mapped, right, same, top, width, x, y };
