# Rapier Integration (Optional)

ExoJS includes an optional Rapier adapter for practical rigid-body workflows.

## Install Rapier

```bash
npm install @dimforge/rapier2d-compat
```

## Create a Physics World

```ts
import { createRapierPhysicsWorld } from 'exojs';

const physics = await createRapierPhysicsWorld({
    gravityX: 0,
    gravityY: 9.81,
});
```

If Rapier is unavailable, creation throws a clear setup error.

## Attach Nodes

```ts
const binding = physics.attachNode(playerSprite, {
    type: 'dynamic',
    shape: { type: 'box', width: 24, height: 32 },
    collisionFilter: {
        membership: 1,
        collidesWith: [2, 3],
    },
});
```

## Step and Sync

```ts
public override update(delta: import('exojs').Time): void {
    physics.step(delta.seconds);
}
```

Default sync mode is `physicsToNode`.

Manual mode is also available:

```ts
binding.syncMode = 'manual';
binding.syncNodeFromBody();
```

## Trigger vs Solid

```ts
physics.attachNode(pickupZone, {
    type: 'static',
    shape: { type: 'circle', radius: 32 },
    trigger: true,
});
```

Use `onTriggerEnter` / `onTriggerExit` and `onCollisionEnter` / `onCollisionExit` signals.

## Debug Draw

```ts
const debugGraphics = physics.createDebugGraphics();

public override draw(runtime: import('exojs').SceneRenderRuntime): void {
    physics.updateDebugGraphics(debugGraphics);
    world.root.render(runtime);
    debugGraphics.render(runtime);
}
```
