// @vitest-environment node
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

import * as core from '@codexo/exojs';
import * as physics from '@codexo/exojs/physics';
import ts from 'typescript';
import { expect, it } from 'vitest';

interface DragScene extends core.Scene {
  world: physics.PhysicsWorld;
  bodies: physics.PhysicsBody[];
  level: core.Graphics;
  overlay: core.Graphics;
  dragJoint: physics.MouseJoint | null;
  onDown(pointer: { x: number; y: number }): void;
  onMove(pointer: { x: number; y: number }): void;
  onEnd(): void;
}

const createScene = (): DragScene => {
  const source = readFileSync(new URL('../../examples/physics/sprite-follows-body.ts', import.meta.url), 'utf8')
    .replace(/^import[\s\S]*?from '[^']+';\s*/gm, '')
    .split('const app = new Application(')[0]!;
  const code = ts.transpileModule(`${source}\nSpriteFollowsBodyScene;`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const SceneClass = runInNewContext(code, { ...core, ...physics }) as new () => DragScene;

  return new SceneClass();
};

it.each([
  [64, 82],
  [90, 90],
])('lifts and follows a %ix%i body through the example pointer handlers', (width, height) => {
  const scene = createScene();
  const world = new physics.PhysicsWorld({ gravity: { x: 0, y: 1400 } });
  scene.world = world;
  const body = world.add(
    new physics.PhysicsBody({
      type: 'dynamic',
      position: { x: 420, y: 480 - height / 2 },
      colliders: [{ shape: new physics.BoxShape(width, height) }],
    }),
  );
  world.add(
    new physics.PhysicsBody({
      type: 'static',
      position: { x: 640, y: 504 },
      colliders: [{ shape: new physics.BoxShape(1152, 48) }],
    }),
  );
  scene.bodies.push(body);
  const target = { x: 640, y: 260 };

  try {
    scene.onDown({ x: body.x, y: body.y });
    expect(scene.dragJoint).not.toBeNull();
    scene.onMove(target);

    for (let frame = 0; frame < 90; frame++) {
      world.step(1 / 60);
    }

    expect(Math.abs(body.x - target.x)).toBeLessThan(10);
    expect(Math.abs(body.y - target.y)).toBeLessThan(10);
    scene.onEnd();
    expect(scene.dragJoint).toBeNull();
    const releasedY = body.y;

    for (let frame = 0; frame < 30; frame++) {
      world.step(1 / 60);
    }

    expect(body.y).toBeGreaterThan(releasedY + 50);
  } finally {
    world.destroy();
    scene.level.destroy();
    scene.overlay.destroy();
    core.Scene.prototype.destroy.call(scene);
  }
});
