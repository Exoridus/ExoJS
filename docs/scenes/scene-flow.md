# Scene Flow

This guide covers scene lifecycle, stack behavior, participation policies, and transitions.

## Scene Lifecycle

A scene can implement:

- `load(loader)`
- `init(loader)`
- `update(delta)`
- `draw(runtime)`
- `handleInput(event)`
- `unload(loader)`

The common draw pattern is:

```ts
public override draw(runtime: import('exojs').SceneRenderRuntime): void {
    this.root.render(runtime);
}
```

## Replace vs Stack

### Replace

```ts
await app.sceneManager.setScene(new GameScene());
```

### Push overlay/modal/opaque

```ts
await app.sceneManager.pushScene(new PauseScene(), {
    mode: 'modal',
    input: 'capture',
});
```

### Pop

```ts
await app.sceneManager.popScene();
```

## Participation Policies

`mode` controls update/draw for lower scenes:

- `overlay`: lower scenes update and draw
- `modal`: lower scenes draw but do not update
- `opaque`: lower scenes neither update nor draw

`input` controls routing:

- `capture`: stop routing below
- `passthrough`: continue routing below unless `handleInput` returns `false`
- `transparent`: skip this scene for input

You can define defaults per scene:

```ts
scene.setParticipationPolicy({
    mode: 'modal',
    input: 'capture',
});
```

## Fade Transitions

`setScene`, `pushScene`, and `popScene` accept fade transitions:

```ts
import { Color } from 'exojs';

await app.sceneManager.setScene(new GameOverScene(), {
    transition: {
        type: 'fade',
        duration: 250,
        color: Color.black,
    },
});
```

## Camera/View Helpers

Use the active view from `app.renderManager.view`:

```ts
import { Rectangle } from 'exojs';

const view = app.renderManager.view;

view.follow(player, { lerp: 0.15 });
view.setBounds(new Rectangle(0, 0, worldWidth, worldHeight));
view.setZoom(1.2);
view.shake(8, 180, { frequency: 14, decay: true });
```
