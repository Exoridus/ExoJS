import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';

import * as core from '@codexo/exojs';
import * as physics from '@codexo/exojs/physics';
import { ScriptTarget, transpileModule } from 'typescript';
import { expect, it, vi } from 'vitest';

it('compares real bounce and sliding behavior, then resets every body without retaining motion', () => {
  const source = readFileSync(resolve(import.meta.dirname, '../../examples/physics/materials-playground.ts'), 'utf8')
    .replace(/^import[\s\S]*?from '[^']+';\n/gm, '')
    .split('const app = new Application(')[0]!;
  const code = transpileModule(`${source}\nMaterialsPlaygroundScene;`, {
    compilerOptions: { target: ScriptTarget.ES2022 },
  }).outputText;
  const nodes: Array<{ destroy(): void }> = [];
  let reset!: () => void;
  let viewport = { width: 1280, height: 720, contentHeight: 610, scale: 1 };
  const Scene = runInNewContext(code, {
    ...core,
    ...physics,
    Scene: class {
      app = { width: 1280, height: 720, fixedTimeStep: core.Time.seconds(1 / 60) };
      systems = { add: (world: physics.PhysicsWorld) => world };
      inputs = { onTrigger: vi.fn() };
      loader = { get: () => null };

      track<T extends { destroy(): void }>(node: T): T {
        nodes.push(node);

        return node;
      }
    },
    assets: { physicsWoodBall: {}, physicsMetalBall: {}, physicsStoneBall: {} },
    demoPanel: (options: { actions: { 'Drop again': () => void } }) => {
      reset = options.actions['Drop again'];

      return { dispose: vi.fn(), fit: () => viewport };
    },
  }) as new () => {
    init(): void;
    world: physics.PhysicsWorld;
    balls: Array<{ body: physics.PhysicsBody; startY: number }>;
    labels: core.Text[];
    draw(context: { render: ReturnType<typeof vi.fn> }): void;
  };
  const scene = new Scene();
  scene.init();

  try {
    const bounces = [0, 0, 0];

    for (let step = 0; step < 120; step++) {
      scene.world.step(1 / 60);
      scene.balls.forEach(({ body }, index) => {
        bounces[index] = Math.max(bounces[index]!, -body.linearVelocityY);
      });
    }

    const [wood, metal, stone] = scene.balls.map(({ body }) => body);
    expect(bounces[1]).toBeGreaterThan(bounces[0]!);
    expect(bounces[0]).toBeGreaterThan(bounces[2]!);
    expect(metal!.x).toBeGreaterThan(wood!.x + 50);
    expect(wood!.x).toBeGreaterThan(stone!.x);
    reset();

    for (const { body, startY } of scene.balls) {
      expect([body.x, body.y]).toEqual([190, startY]);
      expect(body.angle).toBeCloseTo(0);
      expect([body.linearVelocityX, body.linearVelocityY, body.angularVelocity]).toEqual([300, 0, 0]);
      expect(body.isSleeping).toBe(false);
    }

    for (const presentation of [
      { width: 1280, height: 720, contentHeight: 610, scale: 1 },
      { width: 320, height: 180, contentHeight: 90, scale: 4 },
    ]) {
      viewport = presentation;
      scene.draw({ render: vi.fn() });

      for (const label of scene.labels) {
        expect(label.style.fontSize / viewport.scale).toBe(12);
        expect(label.y + label.style.fontSize).toBeLessThan(viewport.contentHeight * viewport.scale);
      }

      expect(scene.balls.map(({ body }) => body.x)).toEqual([190, 190, 190]);
    }
  } finally {
    scene.world.destroy();
    nodes.forEach(node => node.destroy());
  }
});
