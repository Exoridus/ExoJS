import { Rectangle } from '#math/Rectangle';
import { Mesh } from '#rendering/mesh/Mesh';
import { AnimatedSprite } from '#rendering/sprite/AnimatedSprite';
import { Sprite } from '#rendering/sprite/Sprite';
import type { Texture } from '#rendering/texture/Texture';

const createTextureStub = (): Texture =>
  ({
    width: 128,
    height: 64,
    flipY: false,
    updateSource: () => undefined,
  }) as unknown as Texture;

/** Two triangles spanning -50..+50 on both axes, i.e. centred on (0, 0). */
const createCenteredMesh = (): Mesh =>
  new Mesh({
    vertices: new Float32Array([-50, -50, 50, -50, 50, 50, -50, -50, 50, 50, -50, 50]),
  });

describe('SceneNode._updateOrigin', () => {
  test('derives the origin from the bounds origin, not just the extent', () => {
    const mesh = createCenteredMesh();

    expect(mesh.getLocalBounds().x).toBe(-50);
    expect(mesh.getLocalBounds().y).toBe(-50);

    mesh.anchor.set(0.5, 0.5);

    // The middle of -50..+50 is (0, 0). Deriving from width/height alone
    // yields (50, 50) and a mesh that rotates about its bottom-right corner.
    expect(mesh.origin.x).toBe(0);
    expect(mesh.origin.y).toBe(0);

    mesh.destroy();
  });

  test('places the extreme anchors on the bounds edges of an off-origin mesh', () => {
    const mesh = createCenteredMesh();

    mesh.anchor.set(1, 1);
    expect(mesh.origin.x).toBe(50);
    expect(mesh.origin.y).toBe(50);

    // Back to the top-left anchor. Note the ordering: the anchor vector only
    // re-derives on an actual change, so a mesh that never left the default
    // (0, 0) anchor keeps its untouched origin rather than the bounds corner.
    mesh.anchor.set(0, 0);
    expect(mesh.origin.x).toBe(-50);
    expect(mesh.origin.y).toBe(-50);

    mesh.destroy();
  });

  test('carries an AnimatedSprite frame offset into the origin', () => {
    const sprite = new AnimatedSprite(createTextureStub(), {
      walk: { frames: [new Rectangle(0, 0, 16, 16)], fps: 10, frameOffsets: [{ x: 5, y: 7 }] },
    });

    sprite.play('walk');
    sprite.anchor.set(0.5, 0.5);

    expect(sprite.getLocalBounds().x).toBe(5);
    expect(sprite.getLocalBounds().y).toBe(7);
    expect(sprite.origin.x).toBe(5 + 8);
    expect(sprite.origin.y).toBe(7 + 8);

    sprite.destroy();
  });

  test('carries the frame offset into the origin when the anchor was set first', () => {
    // The frame-offset write happens AFTER setTextureFrame's own origin pass,
    // so the anchor-before-play ordering only lands if _applyFrame re-derives.
    const sprite = new AnimatedSprite(createTextureStub(), {
      walk: { frames: [new Rectangle(0, 0, 16, 16)], fps: 10, frameOffsets: [{ x: 5, y: 7 }] },
    });

    sprite.anchor.set(0.5, 0.5);
    sprite.play('walk');

    expect(sprite.origin.x).toBe(5 + 8);
    expect(sprite.origin.y).toBe(7 + 8);

    sprite.destroy();
  });

  test('leaves a node whose bounds start at (0, 0) exactly where it was', () => {
    // The common case must not move: every Sprite and every non-offset frame
    // writes a rectangle at (0, 0), where bounds origin contributes nothing.
    const sprite = new Sprite(createTextureStub());

    sprite.setTextureFrame(new Rectangle(0, 0, 32, 24));
    sprite.anchor.set(0.5, 0.5);

    expect(sprite.origin.x).toBe(16);
    expect(sprite.origin.y).toBe(12);

    sprite.anchor.set(1, 0);

    expect(sprite.origin.x).toBe(32);
    expect(sprite.origin.y).toBe(0);

    sprite.destroy();
  });
});
