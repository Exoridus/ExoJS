# Rapier Physics Integration

ExoJS exposes optional Rapier integration through `createRapierPhysicsWorld`.

## Entry Point

```ts
const physics = await createRapierPhysicsWorld();
```

## Body Attachment

```ts
const binding = physics.attachNode(node, {
    type: 'dynamic',
    shape: { type: 'box', width: 24, height: 24 },
});
```

## Collision Filtering

Use `membership` and `collidesWith` groups:

```ts
collisionFilter: {
    membership: 1,
    collidesWith: [2, 3],
}
```

## Trigger/Solid

```ts
trigger: true
```

Triggers fire overlap events without physical blocking.

## Transform Sync

Default sync mode is `physicsToNode`.

- `binding.syncBodyFromNode()` for explicit body writes
- `binding.syncNodeFromBody()` for explicit node writes
- `binding.teleport(x, y, rotation?)` for teleports

## Debug Draw

`physics.createDebugGraphics()` and `physics.updateDebugGraphics(...)` provide practical runtime visualization.
