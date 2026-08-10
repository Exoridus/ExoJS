import { Rectangle } from '#math/Rectangle';
import { Mesh } from '#rendering/mesh/Mesh';
import { AnimatedSprite } from '#rendering/sprite/AnimatedSprite';
import { NineSliceSprite } from '#rendering/sprite/NineSliceSprite';
import { RepeatingSprite } from '#rendering/sprite/RepeatingSprite';
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

describe('anchor → origin is a pure function of the anchor and the layout box', () => {
  test('derives the origin from the box SIZE, never from where the AABB starts', () => {
    const mesh = createCenteredMesh();

    expect(mesh.getLocalBounds().x).toBe(-50);
    expect(mesh.getLocalBounds().y).toBe(-50);

    mesh.anchor.set(0.5, 0.5);

    // 100x100 box, anchor 0.5 → (50, 50). The bounds origin (-50, -50) does
    // not participate.
    expect(mesh.origin.x).toBe(50);
    expect(mesh.origin.y).toBe(50);

    mesh.destroy();
  });

  test('is path-independent: anchor (1, 1) then (0, 0) matches a never-touched anchor', () => {
    const untouched = createCenteredMesh();
    const roundTripped = createCenteredMesh();

    roundTripped.anchor.set(1, 1);
    expect(roundTripped.origin.x).toBe(100);
    expect(roundTripped.origin.y).toBe(100);

    roundTripped.anchor.set(0, 0);

    // The defect this guards: with the bounds origin folded in, this landed on
    // (-50, -50) while the untouched mesh sat at (0, 0) — same anchor value,
    // two different origins, decided by history.
    expect(roundTripped.origin.x).toBe(untouched.origin.x);
    expect(roundTripped.origin.y).toBe(untouched.origin.y);
    expect(roundTripped.origin.x).toBe(0);
    expect(roundTripped.origin.y).toBe(0);

    untouched.destroy();
    roundTripped.destroy();
  });

  test('anchor (0, 0) always derives origin (0, 0), whatever the box is', () => {
    const mesh = createCenteredMesh();

    mesh.anchor.set(0.25, 0.75);
    mesh.anchor.set(0, 0);

    expect(mesh.origin.x).toBe(0);
    expect(mesh.origin.y).toBe(0);

    mesh.destroy();
  });
});

describe('sprite anchoring is unchanged (regression guard)', () => {
  test('Sprite derives the origin from its frame size', () => {
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

  test('a texture sub-frame with a non-zero x/y still anchors on the frame size', () => {
    // The FRAME rectangle's position is an atlas coordinate, not a layout
    // offset: the local box a sub-framed sprite draws always starts at (0, 0).
    const sprite = new Sprite(createTextureStub());

    sprite.setTextureFrame(new Rectangle(64, 32, 32, 24));
    sprite.anchor.set(0.5, 0.5);

    expect(sprite.getLocalBounds().x).toBe(0);
    expect(sprite.getLocalBounds().y).toBe(0);
    expect(sprite.origin.x).toBe(16);
    expect(sprite.origin.y).toBe(12);

    sprite.destroy();
  });

  test('NineSliceSprite anchors on its layout size', () => {
    const sprite = new NineSliceSprite(createTextureStub(), { slices: { left: 4, top: 4, right: 4, bottom: 4 } });

    sprite.setSize(80, 40);
    sprite.anchor.set(0.5, 1);

    expect(sprite.origin.x).toBe(40);
    expect(sprite.origin.y).toBe(40);

    sprite.destroy();
  });

  test('RepeatingSprite anchors on its layout size', () => {
    const sprite = new RepeatingSprite(createTextureStub());

    sprite.setSize(90, 50);
    sprite.anchor.set(0.5, 0.5);

    expect(sprite.origin.x).toBe(45);
    expect(sprite.origin.y).toBe(25);

    sprite.destroy();
  });
});

describe('AnimatedSprite anchors against the untrimmed source canvas', () => {
  test('the pivot stands still across frames with per-frame offsets', () => {
    const sprite = new AnimatedSprite(createTextureStub(), {
      punch: {
        frames: [new Rectangle(0, 0, 16, 16), new Rectangle(16, 0, 16, 16), new Rectangle(32, 0, 16, 16)],
        fps: 10,
        frameOffsets: [
          { x: 0, y: 0 },
          { x: 4, y: 6 },
          { x: 2, y: 1 },
        ],
      },
    });

    sprite.anchor.set(0.5, 0.5);
    sprite.play('punch');

    // Derived canvas: max(offset + extent) = (4 + 16, 6 + 16) = (20, 22).
    const expectedX = 10;
    const expectedY = 11;

    expect(sprite.origin.x).toBe(expectedX);
    expect(sprite.origin.y).toBe(expectedY);

    for (let frame = 1; frame < 3; frame++) {
      sprite.update(0.1);

      expect(sprite.currentFrame).toBe(frame);
      // The per-frame offset moved the local rectangle …
      expect(sprite.getLocalBounds().x).not.toBe(0);
      // … but the pivot did not move with it.
      expect(sprite.origin.x).toBe(expectedX);
      expect(sprite.origin.y).toBe(expectedY);
    }

    sprite.destroy();
  });

  test('setting the anchor after playback started uses the same canvas', () => {
    const sprite = new AnimatedSprite(createTextureStub(), {
      punch: {
        frames: [new Rectangle(0, 0, 16, 16), new Rectangle(16, 0, 16, 16)],
        fps: 10,
        frameOffsets: [
          { x: 0, y: 0 },
          { x: 4, y: 6 },
        ],
      },
    });

    sprite.play('punch');
    sprite.update(0.1);
    expect(sprite.currentFrame).toBe(1);

    sprite.anchor.set(0.5, 0.5);

    expect(sprite.origin.x).toBe(10);
    expect(sprite.origin.y).toBe(11);

    sprite.destroy();
  });

  test('a clip without frameOffsets keeps the plain per-frame layout box', () => {
    const sprite = new AnimatedSprite(createTextureStub(), {
      walk: { frames: [new Rectangle(0, 0, 16, 16), new Rectangle(16, 0, 16, 16)], fps: 10 },
    });

    sprite.anchor.set(0.5, 0.5);
    sprite.play('walk');

    expect(sprite.origin.x).toBe(8);
    expect(sprite.origin.y).toBe(8);

    sprite.destroy();
  });

  test('an anchor set before any clip plays measures the full texture', () => {
    const sprite = new AnimatedSprite(createTextureStub(), {
      walk: { frames: [new Rectangle(0, 0, 16, 16)], fps: 10 },
    });

    sprite.setAnchor(0.5);

    expect(sprite.origin.x).toBe(64);
    expect(sprite.origin.y).toBe(32);

    sprite.destroy();
  });
});
