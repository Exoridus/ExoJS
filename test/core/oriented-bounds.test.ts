import { describe, expect, it } from 'vitest';

import { SceneNode } from '#core/SceneNode';
import { Rectangle } from '#math/Rectangle';
import { Container } from '#rendering/Container';
import { Drawable } from '#rendering/Drawable';

/**
 * Oriented bounding-box (OBB) collision axes for rotated nodes. A rotated node's
 * SAT collision must use its true oriented-box normals/projection — not the loose
 * axis-aligned `getBounds()` AABB, which reports the wrong separating axes and so
 * accepts collisions the oriented box rejects.
 */
describe('SceneNode oriented bounds (rotated SAT)', () => {
  it('getNormals() returns oriented (non-axis-aligned) axes for a rotated node', () => {
    const node = new SceneNode();
    node.getLocalBounds().set(0, 0, 100, 40);
    node.setRotation(45);
    node.updateParentTransform();

    const normals = node.getNormals();

    // At 45° at least one edge normal must be diagonal — an AABB reports only
    // axis-aligned (±1, 0) / (0, ±1) normals.
    const hasDiagonal = normals.some(n => Math.abs(n.x) > 0.1 && Math.abs(n.y) > 0.1);
    expect(hasDiagonal).toBe(true);
  });

  it('intersectsWith() rejects an AABB false-positive against a rotated node', () => {
    // An 80×80 square rotated 45° about its centre at world (100, 100): its AABB is
    // ~[43, 157]² but the oriented diamond does not reach the AABB corners.
    const node = new SceneNode();
    node.getLocalBounds().set(0, 0, 80, 80);
    node.setOrigin(40, 40);
    node.setPosition(100, 100);
    node.setRotation(45);
    node.updateParentTransform();

    // A small target in the AABB corner — inside the AABB, outside the diamond.
    const target = new Rectangle(148, 148, 6, 6);

    expect(node.getBounds().intersectsWith(target)).toBe(true); // genuinely inside the loose AABB
    expect(node.intersectsWith(target)).toBe(false); // but the oriented box rejects it
  });

  it('uses oriented axes when the rotation is inherited from a rotated parent', () => {
    // The child has no rotation of its own — its world box is rotated only because
    // the parent is. isAlignedBox (a node-local check) is therefore true, yet the
    // collision must still test the oriented world box.
    const parent = new Container();
    parent.setPosition(100, 100);
    parent.setRotation(45);

    const child = new Drawable();
    child.getLocalBounds().set(-40, -40, 80, 80); // centred on the parent's pivot
    parent.addChild(child);
    child.updateParentTransform();

    expect(child.isAlignedBox).toBe(true); // the child's own rotation is zero

    const target = new Rectangle(148, 148, 6, 6); // in the world AABB corner, outside the diamond

    expect(child.getBounds().intersectsWith(target)).toBe(true); // genuinely inside the loose world AABB
    expect(child.intersectsWith(target)).toBe(false); // but the inherited-oriented box rejects it
  });
});
