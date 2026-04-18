# View / Camera

`View` controls projection, camera movement, viewport, and camera effects.

## Follow

```ts
view.follow(player, {
    lerp: 0.15,
    offsetX: 0,
    offsetY: -32,
});
```

Use `clearFollow()` to stop.

## Bounds Clamp

```ts
view.setBounds(new Rectangle(0, 0, worldWidth, worldHeight));
view.clearBounds();
```

## Shake

```ts
view.shake(8, 180, {
    frequency: 14,
    decay: true,
});

view.stopShake();
```

## Zoom

```ts
view.setZoom(1.25);
view.zoomIn(0.1);
view.zoomOut(0.1);
```

## Update

`Application.update()` already calls `view.update(deltaMilliseconds)` each frame for the active render manager view.
