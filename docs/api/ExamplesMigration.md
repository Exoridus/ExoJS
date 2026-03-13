# Examples Migration

This page summarizes the ExoJS refactors that examples and integration code need to follow.

## Rendering flow

The normal rendering flow is now:

1. `Application` owns frame presentation.
2. `Scene.update(delta)` mutates state.
3. `Scene.draw(runtime)` submits drawables.
4. `Application` calls `display()` on the active render runtime.

Use this in scene code:

```ts
public draw(runtime: SceneRenderRuntime): void {
    this.root.render(runtime);
}
```

The `root` container is a structural scene-graph entry point, not an implicit full-scene render. Scenes still keep explicit control over which subtree renders:

```ts
public draw(runtime: SceneRenderRuntime): void {
    this.world.render(runtime);
    this.ui.render(runtime);
}
```

Do not use:

- `renderManager.draw(...)`
- `renderManager.display()` from scene code

Use drawable submission instead:

- `drawable.render(runtime)`
- `root.render(runtime)`

## View handling

View switching now has a stable runtime convenience:

```ts
app.renderManager.setView(view);
```

This forwards to the current render target:

```ts
app.renderManager.renderTarget.setView(view);
```

## Backend selection

`new Application()` now defaults to automatic backend selection:

- prefer WebGPU when available
- fall back to WebGL2 when WebGPU is unavailable or initialization fails

Explicit backend selection still works:

```ts
new Application({ backend: { type: 'webgpu' } });
new Application({ backend: { type: 'webgl2' } });
new Application({ backend: { type: 'auto' } });
```

## Updated public type names

### Core

- `IApplicationOptions` -> `ApplicationOptions`
- `IWebGl2BackendConfig` -> `WebGl2BackendConfig`
- `IWebGpuBackendConfig` -> `WebGpuBackendConfig`
- `IAutoBackendConfig` -> `AutoBackendConfig`
- `ISceneData` -> `SceneData`

### Rendering

- `IRenderBackend` -> `SceneRenderRuntime`
- `IRenderManager` -> `SceneRenderRuntime`
- `IRenderer` -> `Renderer`
- `IWebGpuRenderAccess` -> `WebGpuRenderAccess`
- `IWebGl2RenderBackend` -> `WebGl2RendererRuntime`

### Resource and media contracts

- `IDatabase` -> `Database`
- `IResourceFactory` -> `ResourceFactory`
- `IMedia` -> `Media`
- `IAbstractMediaInitialState` -> `AbstractMediaInitialState`

### Foundational math and shape contracts

- `ICloneable` -> `Cloneable`
- `IDestroyable` -> `Destroyable`
- `IWithBoundingBox` -> `HasBoundingBox`
- `ICollidable` -> `Collidable`
- `ICollisionResponse` -> `CollisionResponse`
- `IShape` -> `ShapeLike`
- `IPoint` -> `PointLike`
- `ILine` -> `LineLike`
- `IRectangle` -> `RectangleLike`
- `ICircle` -> `CircleLike`
- `IEllipse` -> `EllipseLike`
- `IPolygon` -> `PolygonLike`
- `IPlaybackOptions` -> `PlaybackOptions`

### Remaining option/runtime contracts cleaned up in this pass

- `IAudioAnalyserOptions` -> `AudioAnalyserOptions`
- `ILoaderOptions` -> `LoaderOptions`
- `IResourceQueueItem` -> `ResourceQueueItem`
- `IResourceTypeMap` -> `ResourceTypeMap`
- `IFontFactoryOptions` -> `FontFactoryOptions`
- `ICreateCanvasOptions` -> `CreateCanvasOptions`
- `ITextStyleOptions` -> `TextStyleOptions`
- `ISamplerOptions` -> `SamplerOptions`
- `ISpritesheetFrame` -> `SpritesheetFrame`
- `ISpritesheetData` -> `SpritesheetData`
- `IShaderRuntime` -> `ShaderRuntime`
- `IRenderBufferRuntime` -> `RenderBufferRuntime`
- `IVertexArrayObjectRuntime` -> `VertexArrayObjectRuntime`
- `IParticleProperties` -> `ParticleProperties`
- `IParticleEmitter` -> `ParticleEmitter`
- `IParticleAffector` -> `ParticleAffector`

## Enum casing updates

Non-input public enum members now use PascalCase consistently.

Examples and integrations should update member access accordingly:

- `BlendModes.Normal`
- `RendererType.Sprite`
- `RenderingPrimitives.Triangles`
- `ScaleModes.Linear`
- `WrapModes.ClampToEdge`
- `ApplicationStatus.Running`

## Input / gamepad changes

The input layer now uses ordered `GamepadDefinition[]` resolution.

Use:

- `gamepadDefinitions`

Do not use the removed older gamepad mapping/profile configuration path.

Canonical generic gamepad channel names are now the intended public surface:

- `ButtonSouth`
- `ButtonEast`
- `ButtonWest`
- `ButtonNorth`
- `LeftStickX`
- `RightStickY`

Avoid platform-specific alias naming in new examples.
