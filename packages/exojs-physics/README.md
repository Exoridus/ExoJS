# @codexo/exojs-physics

A TypeScript 2D rigid-body runtime for ExoJS: bodies, colliders, joints, sensors, contact policy, spatial queries, and scene-node binding.

Use it for simulated motion and collision response. Core's geometric queries are sufficient for simpler hit tests and overlaps. This package contributes no application extension descriptor: construct a `PhysicsWorld` and give it a scene or another explicit owner.

## Install

```sh
npm install --save-exact @codexo/exojs @codexo/exojs-physics
```

Core is a peer dependency. Keep the packages on a compatible release line.

## Start a scene-owned world

```ts
import { Scene, SystemOrder } from '@codexo/exojs';
import { BoxShape, Collider, PhysicsBody, PhysicsWorld } from '@codexo/exojs-physics';

export class GameScene extends Scene {
  override init(): void {
    const world = new PhysicsWorld({ gravity: { x: 0, y: 980 } });

    this.systems.add(world, { order: SystemOrder.Physics });
    world.add(
      new PhysicsBody({
        type: 'static',
        position: { x: 400, y: 560 },
        colliders: [new Collider({ shape: new BoxShape(700, 32) })],
      }),
    );
    world.add(
      new PhysicsBody({
        type: 'dynamic',
        position: { x: 400, y: 100 },
        colliders: [new Collider({ shape: new BoxShape(40, 40) })],
      }),
    );
  }
}
```

The scene registry drives and destroys this world. The snippet creates simulation only; bodies do not draw themselves. Use `world.attach(node, definition)` or `world.bind(body, node)` to connect visible nodes, and render them from the scene's `draw` hook. The [Physics guide](https://exoridus.github.io/ExoJS/en/guide/physics/physics-basics/) supplies a complete, asset-free falling-box application.

## Important boundaries

Choose one stepping clock. A world registered in `scene.systems` is stepped by the host; do not also call `step()`. An independently hosted world can use `step(frameDeltaSeconds)` and its own accumulator.

Physics angles use radians and clockwise-positive screen rotation. Scene-node rotation uses degrees with the opposite screen sign; the built-in binding performs the conversion. Interpolation affects bound-node presentation, not the number of collision steps.

Continuous collision covers supported translational shape casts, not unrestricted rotational sweeping. Boundary-only geometry is not a solid dynamic mass. Fixed timesteps do not promise cross-build or cross-machine lockstep determinism, and performance depends on the actual contacts, shapes, and workload.

For tilemap collision, use [`@codexo/exojs-tilemap-physics`](https://github.com/Exoridus/ExoJS/tree/next/packages/exojs-tilemap-physics). For diagnostic drawing, use the package's `@codexo/exojs-physics/debug` entry point.

## Documentation

[Physics guide](https://exoridus.github.io/ExoJS/en/guide/physics/physics-basics/) · [Joints and contact behavior](https://exoridus.github.io/ExoJS/en/guide/physics/joints-and-dynamics/) · [PhysicsWorld API](https://exoridus.github.io/ExoJS/en/api/physics-world/) · [Drag and Throw playground](https://exoridus.github.io/ExoJS/en/playground/?example=physics/sprite-follows-body)

## License

MIT © Codexo
