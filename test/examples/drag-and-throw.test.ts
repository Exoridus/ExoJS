// @vitest-environment node
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

import * as core from '@codexo/exojs';
import * as debug from '@codexo/exojs/debug';
import * as physics from '@codexo/exojs/physics';
import ts from 'typescript';
import { expect, it, vi } from 'vitest';

interface DragScene extends core.Scene {
  world: physics.PhysicsWorld;
  bodies: physics.PhysicsBody[];
  objects: core.Sprite[];
  characters: core.SpritesheetData;
  tiles: core.SpritesheetData;
  dragLine: core.Graphics;
  dragJoint: physics.MouseJoint | null;
  onDown(pointer: { id: number }, x: number, y: number): void;
  onMove(pointer: { id: number }, x: number, y: number): void;
  onEnd(pointer: { id: number }, x: number, y: number): void;
  onCancel(pointer: { id: number }): void;
}

const createScene = () => {
  const source = readFileSync(new URL('../../examples/physics/sprite-follows-body.ts', import.meta.url), 'utf8')
    .replace(/^import[\s\S]*?from '[^']+';\s*/gm, '')
    .split('const app = new Application(')[0]!;
  const code = ts.transpileModule(`${source}\nSpriteFollowsBodyScene;`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const assets = { platformerCharactersImage: 'characters', platformerTilesImage: 'tiles' };
  const SceneClass = runInNewContext(code, {
    ...core,
    ...physics,
    ...debug,
    assets,
    window: { addEventListener: vi.fn(), removeEventListener: vi.fn() },
    unitsPerCssPixel: () => 1,
  }) as new () => DragScene;
  const scene = new SceneClass();
  const textures = { characters: new core.Texture(), tiles: new core.Texture() };
  const input = {
    onPointerDown: new core.Signal<[core.Pointer, number, number]>(),
    onPointerMove: new core.Signal<[core.Pointer, number, number]>(),
    onPointerUp: new core.Signal<[core.Pointer, number, number]>(),
    onPointerCancel: new core.Signal<[core.Pointer, number, number]>(),
  };
  const onFixedFrame = new core.Signal<[core.Seconds]>();
  Object.defineProperty(scene, 'app', { value: { fixedTimeStep: core.Time.seconds(1 / 60), frameAlpha: 0, input, onFixedFrame } });
  Object.defineProperty(scene, 'systems', { value: { add: (world: physics.PhysicsWorld) => world } });
  Object.defineProperty(scene, 'inputs', { value: { onTrigger: vi.fn() } });
  Object.defineProperty(scene, 'loader', { value: { get: (asset: keyof typeof textures) => textures[asset] } });
  scene.characters = JSON.parse(readFileSync('examples/assets/images/platformer-characters-atlas.json', 'utf8'));
  scene.tiles = JSON.parse(readFileSync('examples/assets/images/platformer-tiles-atlas.json', 'utf8'));
  scene.init();

  const advance = (frames: number) => {
    for (let frame = 0; frame < frames; frame++) {
      scene.world.step(1 / 60);
      onFixedFrame.dispatch(core.Time.seconds(1 / 60));
    }
  };

  const dispose = () => {
    scene.destroy();
    scene.world.destroy();
    Object.values(textures).forEach(texture => texture.destroy());
  };

  return { scene, input, onFixedFrame, advance, dispose };
};

it.each([0, 2])('lifts and follows production object %i through the pointer handlers', index => {
  const { scene, advance, dispose } = createScene();
  const body = scene.bodies[index]!;
  const pointer = { id: 7, x: -100, y: -100 };

  try {
    advance(90);
    scene.onDown(pointer, body.x, body.y);
    expect(scene.dragJoint).not.toBeNull();
    scene.onMove(pointer, 640, 260);
    advance(90);
    expect(Math.abs(body.x - 640)).toBeLessThan(10);
    expect(Math.abs(body.y - 260)).toBeLessThan(10);
    scene.onEnd(pointer, 640, 260);
    advance(1);
    expect(scene.dragJoint).toBeNull();
    const releasedY = body.y;
    advance(30);
    expect(body.y).toBeGreaterThan(releasedY + 50);
  } finally {
    dispose();
  }
});

it('rejects transparent corners and keeps the cropped character at its native aspect ratio', () => {
  const { scene, dispose } = createScene();

  try {
    expect(scene.objects[0]!.textureFrame.width).toBe(78);
    expect(scene.objects[0]!.textureFrame.height).toBe(97);
    expect(scene.objects[0]!.scale.x).toBeCloseTo(scene.objects[0]!.scale.y);
    scene.bodies.forEach((body, index) => {
      const sprite = scene.objects[index]!;
      const hits = scene.world.queryPoint({ x: body.x - sprite.width / 2 + 1, y: body.y - sprite.height / 2 + 1 });
      expect(hits.some(collider => collider.body === body)).toBe(false);
    });
  } finally {
    dispose();
  }
});

it.each([
  { x: 0, y: 0 },
  { x: 15, y: -10 },
])('keeps the drag line on the grab point after rotation: %o', point => {
  const { scene, advance, dispose } = createScene();
  const body = scene.bodies[1]!;
  const pointer = { id: 7 };

  try {
    scene.world.gravity.y = 0;
    scene.world.interpolation = false;
    body.setTransform({ x: 640, y: 250 }, 0.7);
    advance(1);
    scene.onDown(
      pointer,
      body.x + Math.cos(body.angle) * point.x - Math.sin(body.angle) * point.y,
      body.y + Math.sin(body.angle) * point.x + Math.cos(body.angle) * point.y,
    );
    body.setTransform({ x: 680, y: 260 }, 1.2);
    advance(1);
    const x = body.x + Math.cos(body.angle) * point.x - Math.sin(body.angle) * point.y;
    const y = body.y + Math.sin(body.angle) * point.x + Math.cos(body.angle) * point.y;
    scene.onMove(pointer, x + 100, y + 50);
    scene.draw({ render: vi.fn() } as unknown as core.RenderingContext);
    const bounds = scene.dragLine.getBounds();
    expect(Math.abs(bounds.left - x)).toBeLessThan(2);
    expect(Math.abs(bounds.top - y)).toBeLessThan(2);
  } finally {
    dispose();
  }
});

it('keeps the last flick physical and removes pending release listeners on teardown', () => {
  const { scene, input, advance, onFixedFrame, dispose } = createScene();
  const body = scene.bodies[1]!;
  const pointer = { id: 7 };

  try {
    scene.onDown(pointer, body.x, body.y);
    scene.onMove(pointer, body.x + 200, body.y - 50);
    scene.onEnd(pointer, body.x + 200, body.y - 50);
    expect(onFixedFrame.count).toBe(1);
    advance(1);
    expect(body.linearVelocityX).toBeGreaterThan(50);
    expect(scene.dragJoint).toBeNull();
    expect(onFixedFrame.count).toBe(0);
    scene.onDown(pointer, body.x, body.y);
    scene.onEnd(pointer, body.x, body.y);
  } finally {
    dispose();
  }

  expect(onFixedFrame.count).toBe(0);
  expect(Object.values(input).every(signal => signal.count === 0)).toBe(true);
});
