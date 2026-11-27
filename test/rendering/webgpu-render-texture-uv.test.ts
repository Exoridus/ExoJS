import { Container } from '#rendering/Container';
import { RenderRootSource } from '#rendering/plan/RenderRootSource';
import { createSourceScope } from '#rendering/plan/renderSourceItem';
import { Sprite } from '#rendering/sprite/Sprite';
import { RenderTexture } from '#rendering/texture/RenderTexture';
import { TRANSFORM_FLOATS_PER_ROW, TRANSFORM_TINT_BYTES_PER_ROW } from '#rendering/TransformBuffer';
import { WebGpuPersistentSlotStore } from '#rendering/webgpu/WebGpuPersistentSlotStore';
import { WebGpuSpriteRenderer } from '#rendering/webgpu/WebGpuSpriteRenderer';

test.each([undefined, true, false])('RenderTexture V coordinates match live packing in persistent slots (flipY=%s)', flipY => {
  const texture = new RenderTexture(16, 32, flipY === undefined ? undefined : { flipY });
  const sprite = new Sprite(texture);
  const renderer = new WebGpuSpriteRenderer();
  const live = renderer as unknown as {
    _ensureInstanceCapacity(count: number): void;
    _packInstance(sprite: Sprite, texture: RenderTexture, flags: number, node: number): void;
    _instanceUint32: Uint32Array;
  };
  const store = new WebGpuPersistentSlotStore();
  const canonical = new Float32Array(8);

  try {
    live._ensureInstanceCapacity(1);
    live._packInstance(sprite, texture, 0, 0);
    expect(sprite._packSourceQuad(canonical, 0)).toBe(true);
    store.textures.push(texture);
    store.ensureCapacity(1);
    store.writeSlotFrom(0, new Float32Array(TRANSFORM_FLOATS_PER_ROW), 0, new Uint8Array(TRANSFORM_TINT_BYTES_PER_ROW), 0, canonical, 0, 0);
    const persistent = (store as unknown as { _quads: Float32Array })._quads;

    expect(persistent[5]).toBe((live._instanceUint32[4]! >>> 16) / 0xffff);
    expect(persistent[7]).toBe((live._instanceUint32[5]! >>> 16) / 0xffff);
  } finally {
    store.destroy();
    renderer.destroy();
    sprite.destroy();
    texture.destroy();
  }
});

test.each([true, false])('rebuilds RenderTexture UVs after explicit content invalidation (initial flipY=%s)', initialFlip => {
  const texture = new RenderTexture(16, 32, { flipY: initialFlip });
  const sprite = new Sprite(texture);
  const root = new Container();
  root.addChild(sprite);
  root._retainedRootRepresentation();
  const source = new RenderRootSource(root);
  const store = new WebGpuPersistentSlotStore();
  const keys = () => [root._contentRevision, root._structureRevision, root._globalTransformStamp, root._transformRevision] as const;
  let scope = createSourceScope();

  try {
    root.getGlobalTransform();
    scope.items.push(sprite, 0, 0, 0, 0, 16, 32);
    source.adopt(root, scope, ...keys());
    expect(source.prepack()).toBe(true);
    expect(source.isUsable(...keys())).toBe(true);
    expect(scope.items.quads[5]).toBe(initialFlip ? 1 : 0);
    store.textures.push(texture);
    store.ensureCapacity(1);
    store.writeSlotFrom(0, scope.items.rows, 0, scope.items.tints, 0, scope.items.quads, 0, 0);

    texture.flipY = !initialFlip;
    expect(source.isUsable(...keys())).toBe(true);
    expect(source.prepack()).toBe(true);
    expect(scope.items.quads[5]).toBe(initialFlip ? 1 : 0);
    sprite.invalidateContent();
    expect(source.reconcileContent(...keys(), root, false)).toBe(false);
    source.invalidate();
    scope = createSourceScope();
    scope.items.push(sprite, 0, 0, 0, 0, 16, 32);
    source.adopt(root, scope, ...keys());
    expect(source.prepack()).toBe(true);
    expect(scope.items.quads[5]).toBe(initialFlip ? 0 : 1);
    store.writeSlotFrom(0, scope.items.rows, 0, scope.items.tints, 0, scope.items.quads, 0, 0);
    const persistent = (store as unknown as { _quads: Float32Array })._quads;

    expect(persistent[5]).toBe(0);
    expect(persistent[7]).toBe(1);
  } finally {
    source.invalidate();
    store.destroy();
    root.destroy();
    texture.destroy();
  }
});
