# Rapier Integration (Optional)

ExoJS includes an optional Rapier adapter for practical rigid-body workflows.

## Scope and policy

This integration is intentionally narrow. Treat it as the contract:

- **Optional.** `@dimforge/rapier2d-compat` is declared as a peer dependency
  with `peerDependenciesMeta.optional = true`. Apps that never call
  `createRapierPhysicsWorld` never load the Rapier module and pay nothing
  at runtime. The dynamic `import()` inside `RapierPhysicsWorld.create()`
  is what fetches Rapier — there is no top-level dependency.
- **Single adapter.** ExoJS ships exactly one physics adapter: Rapier. There
  is no abstract `PhysicsWorld` base class or interface that spans multiple
  physics libraries, and no plan to add one. The exported types
  (`RapierPhysicsWorld`, `RapierPhysicsBinding`, `RapierPhysicsEvent`,
  `RapierModuleLoader`, etc.) are intentionally Rapier-named so the
  contract is honest about what they bind.
- **No universal physics abstraction is promised for 1.0.** ExoJS is not
  trying to become a physics-engine abstraction layer. If you need a
  different physics library, integrate it directly in your application
  code with no library involvement.
- **Core stays physics-free.** `Application`, `Scene`, `SceneNode`,
  `Container`, `Drawable`, and the rendering pipeline have no knowledge
  of physics. The adapter binds Rapier bodies to scene nodes from the
  outside (via `attachNode(node, options)`); core types do not gain
  `body`, `physicsBody`, or similar fields. Reverse this direction —
  pushing physics into core types — would be a 1.0 blocker and is
  rejected.
- **Contributions of additional physics adapters will not be accepted.**
  The same honesty rule that applies to rendering backends (no fake
  backend-agnostic APIs) applies to physics. One chosen physics, not a
  pseudo-universal facade. Revisit this stance only post-1.0 with strong
  evidence and a non-fake design.

If this scope is too narrow for your use case, the right tactical move is
to integrate your preferred physics library in app code, talk to scene
nodes directly, and treat ExoJS as the rendering/scene layer. The
Rapier adapter is small enough (a single file under `src/physics/`) to
serve as a reference for what an external physics integration looks like.

## Install Rapier

```bash
npm install @dimforge/rapier2d-compat
```

## Create a Physics World

```ts
import { createRapierPhysicsWorld } from '@codexo/exojs';

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
public override update(delta: import('@codexo/exojs').Time): void {
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

public override draw(runtime: import('@codexo/exojs').SceneRenderRuntime): void {
    physics.updateDebugGraphics(debugGraphics);
    world.root.render(runtime);
    debugGraphics.render(runtime);
}
```
