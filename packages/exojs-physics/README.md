# @codexo/exojs-physics

Native 2D **collision, query and sensor** runtime for [ExoJS](https://github.com/Exoridus/ExoJS).

Zero production dependencies, ESM-only, version-locked with the core engine. This
first release ships a complete **collision/query world without dynamics**:
shapes, colliders, bodies, a broad phase, a manifold-generating narrow phase,
collision filters, sensors, events, spatial queries, scene-node binding and a
debug overlay. Forces, impulses and gravity integration (the rigid-body solver)
arrive in a follow-up — the public surface here is forward-compatible with it.

> **Library, not an extension.** Physics contributes no renderer or asset
> bindings, so there is no `/register` entry. Construct a `PhysicsWorld`
> directly. `@codexo/exojs` is a peer dependency.

## Install

```sh
npm install @codexo/exojs @codexo/exojs-physics
```

## Quick start

```ts
import { Scene, Sprite, Vector, type Time } from '@codexo/exojs';
import { BoxShape, CircleShape, PhysicsWorld } from '@codexo/exojs-physics';

class GameScene extends Scene {
  private readonly world = new PhysicsWorld({ gravity: new Vector(0, 980) });

  public override onStart(): void {
    // Static ground (an explicit static body + box collider).
    this.world.createStaticCollider({ shape: new BoxShape(800, 32), position: new Vector(400, 600), friction: 0.9 });

    // A kinematic platform you move yourself.
    const platform = this.world.createBody({ type: 'kinematic', position: new Vector(200, 400) });
    platform.createCollider({ shape: new BoxShape(120, 16) });

    // A sensor trigger.
    const trigger = this.world.createStaticCollider({ shape: new CircleShape(40), position: new Vector(600, 500), isSensor: true });
    this.world.onSensorEnter.add(({ sensor, other }) => {
      if (sensor === trigger) console.log('entered the trigger');
    });
  }

  public override update(delta: Time): void {
    this.world.step(delta.seconds); // fixed-step detection + events + binding
  }
}
```

## What it does

| Area | API |
|---|---|
| World | `PhysicsWorld`, `step`, `gravity`, `timeStepper`, `destroy` |
| Bodies | `createBody` (`dynamic`/`static`/`kinematic`), `setTransform`, mass/inertia from colliders |
| Colliders | `createCollider`, `createStaticCollider`, density/friction/restitution, `isSensor`, filter, offset |
| Shapes | `CircleShape`, `PolygonShape` (convex-validated), `BoxShape` |
| Filtering | `CollisionFilter` (category/mask/group), `shouldCollide` |
| Events | `onCollisionStart` / `onCollisionEnd` / `onSensorEnter` / `onSensorExit` — immutable snapshots |
| Queries | `queryPoint`, `queryAabb` (+ `out` / `forEachAabbHit`), `rayCast`, `rayCastAll`, `overlapShape` |
| Binding | `bind(body, node)` — node tracks the body's position each step |
| Debug | `@codexo/exojs-physics/debug` → `PhysicsDebugDraw` (shapes/AABBs/contacts/normals/centres/broad-phase) |

## Determinism & non-goals

Stepping is fully **caller-driven** and uses a fixed timestep with an
accumulator (`world.step(frameDeltaSeconds)`); the same build replays a scene
identically given the same inputs. There are **no rollback/lockstep determinism
guarantees across builds or machines** (floating-point reality). The package is
single-threaded and 2D only — no workers, GPU, 3D, soft bodies, fluids or
vehicles.

This release contains **no dynamics solver**: bodies move only via
`setTransform`. The narrow phase already produces full contact manifolds (normal,
1–2 points, stable feature ids) so the solver can be added without changing the
public API.

## License

MIT © Codexo
