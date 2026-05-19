# ApplicationOptions API Decision Review

_Authored by claude-sonnet-4-6 · May 2026_
_Source authority: commit b97f552 (main branch)_
_Addendum ergänzt nach Nachgespräch (gleiche Session)_

---

## 1. Executive Verdict

**Yes, `ApplicationOptions` should be reshaped before 0.9.0.**

The current interface is a flat list of 14 options spanning five conceptually distinct subsystems at wildly different levels of user concern. Several options are WebGL2-specific but sit at the top level where WebGPU users also see them. Two options that matter for Loader configuration (`cacheStrategy`, `concurrency`) are not exposed at all through `ApplicationOptions`, creating an invisible asymmetry. The result is an API that looks deceptively simple but hides coupling, punishes discovery, and will become harder to extend cleanly after 1.0.

**Recommended direction: Hybrid (Option C).** Keep five genuinely universal options (`canvas`, `width`, `height`, `clearColor`, `backend`) at the top level. Move everything else into three named subsystem groups: `loader`, `rendering`, `input`. Add the two missing `LoaderOptions` fields (`cacheStrategy`, `concurrency`) to the `loader` group. The top-level shape remains scannable for first-time users; advanced configuration moves to the group where it belongs.

---

## 2. Current API Inventory

Source: `src/core/Application.ts`, lines 30–46.

```ts
export interface ApplicationOptions {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
  debug: boolean;
  clearColor: Color;
  spriteRendererBatchSize: number;
  particleRendererBatchSize: number;
  gamepadDefinitions: GamepadDefinition[];
  gamepadSlotStrategy: GamepadSlotStrategy;
  pointerDistanceThreshold: number;
  webglAttributes: WebGLContextAttributes;
  resourcePath: string;
  requestOptions: RequestInit;
  cache?: CacheStore | readonly CacheStore[];
  backend?: BackendConfig;
}
```

The constructor accepts `Partial<ApplicationOptions>` and merges against `defaultAppSettings`. All options have defaults except `canvas` (created lazily if absent) and `backend` (defaults to `'auto'`).

### Option-by-option inventory

| Option | Default | Subsystem | Backend scope | User frequency |
|---|---|---|---|---|
| `canvas` | auto-created | Canvas/DOM | Both | Common |
| `width` | `800` | Canvas/rendering | Both | Very common |
| `height` | `600` | Canvas/rendering | Both | Very common |
| `clearColor` | `Color.cornflowerBlue` | Rendering | Both | Common |
| `backend` | `{ type: 'auto' }` | Rendering | — | Occasional |
| `debug` | `false` | WebGL2 context | **WebGL2 only** | Rare |
| `webglAttributes` | (defaults below) | WebGL2 context | **WebGL2 only** | Rare |
| `spriteRendererBatchSize` | `4096` | WebGL2 renderer | **WebGL2 only** | Very rare |
| `particleRendererBatchSize` | `8192` | WebGL2 renderer | **WebGL2 only** | Very rare |
| `resourcePath` | `''` | Loader | Both | Common |
| `requestOptions` | `{ GET, cors, default }` | Loader/fetch | Both | Occasional |
| `cache` | `undefined` | Loader/IDB | Both | Occasional |
| `gamepadDefinitions` | `[]` | Input/Gamepad | Both | Rare |
| `gamepadSlotStrategy` | `'sticky'` | Input/Gamepad | Both | Rare |
| `pointerDistanceThreshold` | `10` | Input/Gesture | Both | Very rare |

**Options exposed in `ApplicationOptions` but missing from `LoaderOptions` propagation:**

`cacheStrategy` and `concurrency` are valid `LoaderOptions` fields that the `Loader` constructor accepts, but `ApplicationOptions` never passes them through. A user who wants non-default concurrency or a custom cache strategy has to reach `app.loader` post-construction — and may never discover it's possible.

**Options that affect only one backend but live at the top level:**

- `debug` — wraps the GL context in WebGLDebugUtils (WebGL2 only; WebGpuBackend ignores it)
- `webglAttributes` — `WebGLContextAttributes` passed to `canvas.getContext('webgl2', ...)` (ignored by WebGpuBackend)
- `spriteRendererBatchSize` — `new WebGl2SpriteRenderer(spriteRendererBatchSize)` in `WebGl2Backend`; WebGpuSpriteRenderer takes no args
- `particleRendererBatchSize` — same pattern for `WebGl2ParticleRenderer`

---

## 3. What Feels Ergonomically Weak Today

In priority order:

### 3.1 WebGL2-specific options are invisible at the top level (high priority)

`debug`, `webglAttributes`, `spriteRendererBatchSize`, and `particleRendererBatchSize` are only consumed by `WebGl2Backend`. The `WebGpuBackend` constructor reads only `width`, `height`, and `clearColor` from `app.options`. A user who chooses WebGPU sees four options at the top level that silently do nothing. There is no static type feedback, no runtime warning, no JSDoc noting the scope limitation.

### 3.2 `cacheStrategy` and `concurrency` are not reachable through ApplicationOptions (high priority)

`LoaderOptions` accepts `cacheStrategy?: CacheStrategy` and `concurrency?: number`. `ApplicationOptions` passes only `{ resourcePath, requestOptions, cache }` to `new Loader(...)`. This is an API gap: the loader configuration surface that `ApplicationOptions` implies it owns is actually incomplete. Users who want non-default caching behavior have to discover `app.loader.setConcurrency(n)` post-construction, with no IDE guidance.

### 3.3 Flat option overload obscures audience (medium priority)

The 14 options serve four different kinds of users:
- **All users**: `canvas`, `width`, `height`, `clearColor`, `backend`
- **Asset pipeline users**: `resourcePath`, `cache`, `requestOptions`
- **Gamepad/input users**: `gamepadDefinitions`, `gamepadSlotStrategy`
- **Performance tuners**: `spriteRendererBatchSize`, `particleRendererBatchSize`, `webglAttributes`

A first-time user looking at the type definition in their IDE sees all 14 together with no indication of which five they actually need.

### 3.4 `debug` names the wrong thing (low priority)

`debug: boolean` reads as a global engine debug mode — but it exclusively wraps the WebGL2 context with `WebGLDebugUtils` to throw on GL errors and log calls. The separate `DebugOverlay`/`DebugLayer` system is unrelated to this flag and is configured after construction. The name implies breadth it doesn't have.

### 3.5 `cache` is the only `?`-optional field in the non-canvas set (cosmetic)

`cache?: CacheStore` is optional while `resourcePath: string` and `requestOptions: RequestInit` are required-with-defaults. The distinction is artificial since all three are passed to `Loader` and all three have sensible defaults. The inconsistency creates false expectations about which fields the constructor requires.

---

## 4. Options Evaluated

### Option A — Keep Mostly Flat

Retain the current shape; fix only the most obvious local issues.

**Ergonomics**: The flat surface is quick to scan for simple apps. But 14 options is already at the upper limit of comfortable flat interfaces, and the WebGL2-only options will only accumulate as the engine grows.

**TypeScript clarity**: Good — one flat type is easy to document and hover. Bad — no guidance on which options are relevant for which backend.

**ExoJS identity alignment**: Partially. "Zero magic" is served by keeping everything visible, but "honest separation of subsystems" is violated because WebGL2 internals are co-mingled with universal options.

**Implementation cost**: Near zero.

**Long-term extensibility**: Poor. Each new subsystem option lands at the top level. At 0.9.0 there will be more options, not fewer.

**Verdict**: Insufficient. It addresses naming but not the structural problems.

---

### Option B — Fully Grouped Subsystem Options

Move almost everything into nested groups. Nothing at the top level except the groups themselves.

```ts
new Application({
  canvas: { element, width, height },
  rendering: { backend, clearColor, ... },
  input: { ... },
  loader: { ... },
})
```

**Ergonomics**: Forces the simple `new Application({ width: 800, height: 600 })` case to become `new Application({ canvas: { width: 800, height: 600 } })`. The most common invocation gets noisier.

**TypeScript clarity**: Excellent for advanced use — every group is self-contained and the types compose cleanly.

**ExoJS identity alignment**: Over-engineered for the simple case. "Explicitness without boilerplate" is violated.

**Implementation cost**: Moderate — all construction code and defaults need to change.

**Verdict**: Rejected. Moving `width` and `height` into a nested group creates worse ergonomics for the 90% of apps that only set those two options.

---

### Option C — Hybrid (Recommended)

Keep five genuinely universal options at the top level. Group three subsystem clusters.

```ts
new Application({
  // Top level: universal, touched by most apps
  canvas,
  width,
  height,
  clearColor,
  backend,

  // Subsystem groups: touched by minority of apps, or advanced tuning
  loader: { resourcePath, requestOptions, cache, cacheStrategy, concurrency },
  rendering: { debug, webglAttributes, spriteRendererBatchSize, particleRendererBatchSize },
  input: { gamepadDefinitions, gamepadSlotStrategy, pointerDistanceThreshold },
})
```

**Ergonomics**: The simple case (`width`, `height`, `clearColor`) stays flat. The rarely-touched options are grouped by the subsystem that consumes them. First-time users see a short, meaningful top level; advanced users find their options in logical locations.

**TypeScript clarity**: Excellent. IDE autocomplete reveals three named groups after the top-level universals. WebGL2-specific options are grouped under `rendering`, which a WebGPU user can ignore.

**ExoJS identity alignment**: Strong. Explicit without boilerplate; honest subsystem boundaries; composable config types; low magic.

**Implementation cost**: Moderate — three new option interfaces, updated constructor destructuring, updated defaults merging.

**Long-term extensibility**: Good. New subsystem options land in their group, not at the top level.

**Verdict**: Recommended.

---

### Option D — Narrow Constructor; Configure Managers After Construction

Keep `ApplicationOptions` minimal (`canvas`, `width`, `height`, `backend`). Require post-construction configuration for everything else.

```ts
const app = new Application({ canvas, width: 800, height: 600 });
app.loader.resourcePath = 'assets/';
app.input.configure({ gamepadSlotStrategy: 'compact' });
```

**Ergonomics**: Construction is extremely simple but setup becomes multi-step and verbose. Code that previously fit in the constructor call now requires imperative post-construction calls in the right order.

**TypeScript clarity**: Poor for setup — configuration spread across multiple call sites has no unified type to inspect.

**ExoJS identity alignment**: Weakest of the four. This conflicts with the "configure at creation time" pattern that every example and guide already establishes.

**Implementation cost**: Highest — would require `.configure()` methods on `Loader`, `InputManager`, etc. that don't exist.

**Verdict**: Rejected. The engine already has `app.loader`, `app.input`, etc. as post-construction escape hatches for runtime reconfiguration. That's sufficient. The constructor should remain the canonical setup point.

---

## 5. Recommended Target API

### Exact proposed shape

```ts
export interface ApplicationOptions {
  // ── Universal (top-level) ──────────────────────────────────────────────────
  canvas?: HTMLCanvasElement;
  width?: number;
  height?: number;
  clearColor?: Color;
  backend?: BackendConfig;

  // ── Subsystem groups (all optional; each field within is also optional) ────
  loader?: LoaderApplicationOptions;
  rendering?: RenderingApplicationOptions;
  input?: InputApplicationOptions;
}

/** Loader/asset-pipeline configuration forwarded to the {@link Loader} constructor. */
export interface LoaderApplicationOptions {
  /** Base path prepended to every relative asset URL. Default: `''`. */
  resourcePath?: string;
  /** Default `RequestInit` merged into every `fetch` call. */
  requestOptions?: RequestInit;
  /** One or more persistent cache stores (e.g. `IndexedDbStore`). */
  cache?: CacheStore | readonly CacheStore[];
  /** Policy used to consult cache stores before the network. Defaults to `CacheFirstStrategy`. */
  cacheStrategy?: CacheStrategy;
  /** Maximum simultaneous background-queue fetches. Default: `6`. */
  concurrency?: number;
}

/** Rendering pipeline configuration. Most fields are WebGL2-specific. */
export interface RenderingApplicationOptions {
  /**
   * Wraps the WebGL2 context with WebGLDebugUtils (throws on GL errors, logs every call).
   * Ignored by the WebGPU backend. Default: `false`.
   */
  debug?: boolean;
  /**
   * Attributes passed to `canvas.getContext('webgl2', ...)`. Ignored by WebGPU.
   * Default: `{ alpha: false, antialias: false, premultipliedAlpha: false, ... }`.
   */
  webglAttributes?: WebGLContextAttributes;
  /**
   * Sprite batch size (vertex buffer capacity) for the WebGL2 sprite renderer.
   * Each slot uses ~64 bytes; default 4096 ≈ 262 KB. Ignored by WebGPU.
   */
  spriteRendererBatchSize?: number;
  /**
   * Particle batch size for the WebGL2 particle renderer.
   * Default 8192 ≈ 1.18 MB. Ignored by WebGPU.
   */
  particleRendererBatchSize?: number;
}

/** Input subsystem configuration forwarded to {@link InputManager}. */
export interface InputApplicationOptions {
  /** Custom gamepad hardware definitions merged with built-in mappings. Default: `[]`. */
  gamepadDefinitions?: GamepadDefinition[];
  /** Slot assignment strategy on disconnect. Default: `'sticky'`. */
  gamepadSlotStrategy?: GamepadSlotStrategy;
  /**
   * Maximum pixel distance between pointerdown and pointerup that counts as a tap
   * (also used for gesture recognition thresholds). Default: `10`.
   */
  pointerDistanceThreshold?: number;
}
```

### What stays top-level and why

| Option | Reason |
|---|---|
| `canvas` | DOM identity; needed before any subsystem starts |
| `width` | Universal; every guide example shows it |
| `height` | Universal; same |
| `clearColor` | Universal; visible every frame; tutorial-facing |
| `backend` | Universal; selects the entire rendering path |

### What gets nested and why

| Option | New location | Reason |
|---|---|---|
| `resourcePath` | `loader.resourcePath` | Loader configuration |
| `requestOptions` | `loader.requestOptions` | Loader configuration |
| `cache` | `loader.cache` | Loader configuration |
| `cacheStrategy` *(new)* | `loader.cacheStrategy` | Loader configuration; was missing |
| `concurrency` *(new)* | `loader.concurrency` | Loader configuration; was missing |
| `debug` | `rendering.debug` | WebGL2-specific; rarely set |
| `webglAttributes` | `rendering.webglAttributes` | WebGL2-specific; rarely set |
| `spriteRendererBatchSize` | `rendering.spriteRendererBatchSize` | WebGL2-specific; performance tuning |
| `particleRendererBatchSize` | `rendering.particleRendererBatchSize` | WebGL2-specific; performance tuning |
| `gamepadDefinitions` | `input.gamepadDefinitions` | Input subsystem |
| `gamepadSlotStrategy` | `input.gamepadSlotStrategy` | Input subsystem |
| `pointerDistanceThreshold` | `input.pointerDistanceThreshold` | Input subsystem |

### Removed / renamed

Nothing is removed outright. The `debug` flag is retained but renamed conceptually — it is now `rendering.debug`, and its JSDoc makes its WebGL2-only scope explicit.

---

## 6. Before / After Examples

### Minimal app

```ts
// BEFORE
const app = new Application();

// AFTER — unchanged
const app = new Application();
```

The minimal case does not change. Zero breakage for zero-config users.

---

### Typical game app

```ts
// BEFORE
const app = new Application({
  width: 1280,
  height: 720,
  clearColor: Color.black,
  resourcePath: 'assets/',
  cache: new IndexedDbStore('mygame'),
  gamepadDefinitions: [myCustomPad],
  gamepadSlotStrategy: 'compact',
  pointerDistanceThreshold: 15,
  spriteRendererBatchSize: 8192,
  webglAttributes: { antialias: true },
});

// AFTER
const app = new Application({
  width: 1280,
  height: 720,
  clearColor: Color.black,

  loader: {
    resourcePath: 'assets/',
    cache: new IndexedDbStore('mygame'),
  },

  input: {
    gamepadDefinitions: [myCustomPad],
    gamepadSlotStrategy: 'compact',
    pointerDistanceThreshold: 15,
  },

  rendering: {
    spriteRendererBatchSize: 8192,
    webglAttributes: { antialias: true },
  },
});
```

The top-level now clearly reads: dimensions + clear color. Everything else is findable by subsystem name.

---

### Resources / cache / cacheStrategy

```ts
// BEFORE
// cacheStrategy was impossible to set through ApplicationOptions at all.
// concurrency also unreachable at construction time.
const app = new Application({
  resourcePath: 'assets/',
  requestOptions: { mode: 'same-origin' },
  cache: new IndexedDbStore('mygame'),
});
app.loader.setConcurrency(4); // had to do this post-construction

// AFTER — all loader config in one place, including previously missing fields
const app = new Application({
  loader: {
    resourcePath: 'assets/',
    requestOptions: { mode: 'same-origin' },
    cache: new IndexedDbStore('mygame'),
    cacheStrategy: new NetworkFirstStrategy(),
    concurrency: 4,
  },
});
```

---

### Explicit backend selection

```ts
// BEFORE
const app = new Application({
  width: 1920,
  height: 1080,
  backend: { type: 'webgpu' },
});

// AFTER — unchanged; backend stays top-level
const app = new Application({
  width: 1920,
  height: 1080,
  backend: { type: 'webgpu' },
});
```

---

### WebGL2 antialias + debug

```ts
// BEFORE — `debug` and `webglAttributes` sat alongside `width` and `clearColor`
const app = new Application({
  width: 800,
  height: 600,
  debug: true,
  webglAttributes: { antialias: true },
});

// AFTER — WebGL2-specific options clearly scoped
const app = new Application({
  width: 800,
  height: 600,
  rendering: {
    debug: true,
    webglAttributes: { antialias: true },
  },
});
```

---

### WebGPU-only app (shows what WebGPU users no longer see at top level)

```ts
// BEFORE — WebGPU user sees debug/webglAttributes/spriteRendererBatchSize/particleRendererBatchSize
//          at top level, all silently ignored
const app = new Application({
  width: 1920,
  height: 1080,
  clearColor: Color.black,
  backend: { type: 'webgpu' },
  // debug: true would silently do nothing
  // spriteRendererBatchSize: 8192 would silently do nothing
});

// AFTER — WebGPU user's top level is clean; rendering group exists if needed but
//         JSDoc on each field clarifies "Ignored by WebGPU"
const app = new Application({
  width: 1920,
  height: 1080,
  clearColor: Color.black,
  backend: { type: 'webgpu' },
});
```

---

## 7. Breaking-Change Assessment and Sequencing

### Must-do before 0.9.0

These are high-value breaks that fix real API confusion and should ship together as a clean batch.

| Change | Impact |
|---|---|
| Move `resourcePath` → `loader.resourcePath` | Breaks any app using `resourcePath` at top level |
| Move `requestOptions` → `loader.requestOptions` | Same |
| Move `cache` → `loader.cache` | Same |
| Add `loader.cacheStrategy` and `loader.concurrency` (additive) | No breakage; completes the loader surface |
| Move `gamepadDefinitions` → `input.gamepadDefinitions` | Breaks gamepad apps |
| Move `gamepadSlotStrategy` → `input.gamepadSlotStrategy` | Same |
| Move `pointerDistanceThreshold` → `input.pointerDistanceThreshold` | Same |
| Move `debug` → `rendering.debug` | Breaks any app using WebGL debug mode |
| Move `webglAttributes` → `rendering.webglAttributes` | Breaks apps with custom GL attributes |
| Move `spriteRendererBatchSize` → `rendering.spriteRendererBatchSize` | Breaks high-volume apps with custom batch sizes |
| Move `particleRendererBatchSize` → `rendering.particleRendererBatchSize` | Same |

### Nice-to-do before 0.9.0

| Change | Notes |
|---|---|
| Rename `rendering.debug` to `rendering.webglDebug` | Makes the WebGL2 scope unmistakable. Lower priority — the JSDoc is probably sufficient. |
| Export `LoaderApplicationOptions`, `RenderingApplicationOptions`, `InputApplicationOptions` as public named types | Allows users to type-check partial configs in separate files. |

### Defer

| Change | Notes |
|---|---|
| `audio` options group | AudioManager is a module-level singleton, not owned by Application. Post-construction `app.audio.muteOnHidden = true` is a single clear line. Adding an audio group implies ownership that doesn't exist. Defer to a future pass if the audio API grows. |
| Lifecycle callbacks in constructor | Signals already cover this. Callbacks in the constructor create callback hell and are harder to remove. Defer indefinitely. |

### Proposed sequencing

**Option 1 (recommended — single clean break):**

Ship the full redesign as a 0.9.0 breaking change. There are no real end users. A single clean migration is better than two releases of transition friction.

**Option 2 (if 0.8.x additive pass is preferred):**

0.8.x: Add `loader?`, `rendering?`, `input?` as new optional nested groups while keeping all current top-level fields, so old code continues to work. Document the new groups as the preferred path.

0.9.0: Remove the deprecated top-level fields that were moved into groups.

Given that there are effectively no real end users, Option 1 is preferable. It avoids accumulating compatibility shim logic in the constructor for a release cycle.

**Do not add `@deprecated` JSDoc shims.** This was stated explicitly in the project's pre-1.0 policy (`project-pre-1.0-no-backcompat.md`): pre-1.0 API renames are clean breaks with no normalizers.

---

## 8. Relation to Loader / Assets

### What the Loader now supports

The Loader redesign (implemented as of this review) supports:

- `Asset<T>` and `Assets<M>` typed references
- `LoadingQueue` with per-item progress tracking
- `CacheStore` / `CacheStrategy` for persistent IDB caching
- `cacheStrategy?: CacheStrategy` (policy override, e.g. NetworkFirst)
- `concurrency?: number` (background queue parallelism)
- Custom asset type handlers via `registerAssetType`

### Should ApplicationOptions expose Loader/cache/resource defaults?

**Yes**, and the current API already tries to — but incompletely.

The `loader` group should forward all five `LoaderOptions` fields:

| Field | Exposed today? | In proposed `loader` group |
|---|---|---|
| `resourcePath` | Yes (top-level) | Yes |
| `requestOptions` | Yes (top-level) | Yes |
| `cache` | Yes (top-level) | Yes |
| `cacheStrategy` | **No** | **Yes (new)** |
| `concurrency` | **No** | **Yes (new)** |

Adding `cacheStrategy` and `concurrency` to the `loader` group is purely additive and closes the gap. The Loader's constructor already accepts them.

### What should NOT be in ApplicationOptions regarding Loader

- **Initial asset manifests or bundle registration.** These belong in scene `load()` hooks. `ApplicationOptions` has no knowledge of what assets the application will need.
- **IDB database naming beyond the store itself.** The user creates an `IndexedDbStore('name')` and passes it. The Application does not need to know the IDB name directly.
- **Custom factory registration.** `loader.register(MyType, myFactory)` is correct post-construction configuration.

---

## 9. What Should NOT Move Into ApplicationOptions

### Lifecycle callbacks

The Application already provides `Signal`-based hooks: `onFrame`, `onResize`, `onCanvasFocusChange`, `onVisibilityChange`, `onBackendLost`, `onBackendRestored`. Constructor callbacks would duplicate these with worse ergonomics (harder to remove, harder to compose). Rejected.

### Scene graph defaults

Drawables (Sprite, Container, Mesh) have their own defaults. Configuring per-drawable defaults through the Application constructor would be unexpected, undiscoverable, and silently ineffective for drawables created outside Application control. Rejected.

### Initial assets / asset preloading

Asset loading belongs in scene lifecycle hooks (`scene.load()`). Pushing it to `ApplicationOptions` would couple the application structure to specific asset decisions, making unit testing harder and project organization worse. Rejected.

### Debug/profiling toggles (beyond `rendering.debug`)

The `DebugOverlay`, `DebugLayer`, `BoundingBoxesLayer`, etc. are explicitly opt-in overlays applied at the scene or backend level. They are not startup configuration — they are runtime tools. Application-level debug flags that silently influenced the scene graph would be too magical. Rejected (except the existing `rendering.debug` which is kept for WebGL error tracing).

### CSS / layout concerns

`canvas.style.*`, `ResizeObserver`, pixel ratio handling, full-screen management — these are entirely the user's responsibility. ExoJS creates or accepts a canvas and exposes `app.canvas`. CSS is the user's domain. Rejected.

### `pauseOnHidden`

This is correctly a mutable property (`app.pauseOnHidden = true`) rather than a constructor option, because games may want to change it at runtime (e.g. always-on background simulations that toggle pause mode on scene change). Stays as a mutable property. Do not move to ApplicationOptions.

### `muteOnHidden` (AudioManager)

The AudioManager is a module-level singleton with its own API. Application does not own it; it merely wires the visibility signal to the audio manager. Adding `audio: { muteOnHidden: true }` to ApplicationOptions would imply ownership that doesn't exist and would require the Application constructor to reach into the audio singleton, increasing coupling. Set `app.audio.muteOnHidden = true` post-construction. Rejected for ApplicationOptions.

---

## 10. Identity Alignment Verdict

ExoJS's stated identity: TypeScript-first, zero-dependency, browser-first, explicit without boilerplate, composable, low magic, suitable for games and interactive apps.

**The current flat interface deviates from this in two ways:**

1. **Honest separation of subsystems** is violated. WebGL2 internal knobs (`webglAttributes`, `debug`, batch sizes) are co-equal with universal knobs (`width`, `height`, `clearColor`). A TypeScript-first engine should make the scope of each option visible at the type level — that means grouping by subsystem.

2. **Composability** is weakened by the missing `cacheStrategy`/`concurrency` fields. If the engine's own subsystem (Loader) has configurable options that aren't reachable through the primary configuration surface (ApplicationOptions), the API is not composable — the user has to know to configure the Loader separately, which is not discoverable.

**The hybrid model fixes both deviations** without adding boilerplate for the simple case:

- The most common five options remain at the top level — a first-time user writes `new Application({ width: 800, height: 600 })` and it reads correctly.
- The rarely-needed options are grouped by subsystem with names (`loader`, `rendering`, `input`) that map to what the user conceptually expects.
- TypeScript autocomplete surfaces three groups that collapse and expand naturally.
- The full Loader configuration surface is now reachable at construction time.

The recommendation better fits ExoJS identity than the current shape does.

---

## 11. Final Recommendation

**Redesign before 0.9.0.**

Ship the hybrid model as a single breaking change in 0.9.0:

1. Define `LoaderApplicationOptions`, `RenderingApplicationOptions`, `InputApplicationOptions` as exported named interfaces.
2. Replace the 11 scattered top-level options with three optional nested groups (`loader`, `rendering`, `input`).
3. Keep `canvas`, `width`, `height`, `clearColor`, `backend` at the top level.
4. Add `cacheStrategy` and `concurrency` inside `loader` (additive; they were missing entirely).
5. Update the `Application` constructor to destructure from the new shape.
6. Update the Guide's `application.mdx` examples to show the new shape.
7. No deprecation shims. Clean break.

The total implementation scope is small: three new interfaces, updated constructor destructuring, updated `defaultAppSettings` structure. The guide examples already show only the five top-level options (`canvas`, `width`, `height`, `clearColor`, `backend`, `resourcePath`) — the doc impact is a single example block update. The risk is low; the ergonomic gain is permanent.

---

## Addendum — Nachgespräch: Ergänzungen und offene Fragen

_Dieser Abschnitt dokumentiert Entscheidungen und offene Punkte aus dem Nachgespräch, das unmittelbar nach dem initialen Review stattfand. Er ergänzt — nicht ersetzt — die Abschnitte 1–11._

---

### A.1 Getroffene Entscheidungen

#### `canvas: { ... }` als eigene Options-Gruppe (bestätigt)

`width`, `height` und der Canvas-Element-Parameter wandern aus dem Top-Level in eine `canvas`-Gruppe. Gleichzeitig werden dort neue, bisher fehlende Optionen ergänzt:

```ts
export interface CanvasApplicationOptions {
  element?: HTMLCanvasElement;   // bisher: top-level `canvas`-Key
  width?: number;                // bisher: top-level
  height?: number;               // bisher: top-level
  pixelRatio?: number;           // NEU — war bisher Nutzeraufgabe (s. A.3)
  tabIndex?: number;             // bisher: hardcodiert auf -1
  imageRendering?: 'auto' | 'pixelated' | 'crisp-edges'; // NEU — CSS-Hint für Pixel-Art
}
```

Top-Level verliert damit `width`, `height` und `canvas`. Was verbleibt:

```ts
export interface ApplicationOptions {
  clearColor?: Color;
  backend?: BackendConfig;
  fpsLimit?: number;           // NEU — s. A.3
  backgroundFpsLimit?: number; // NEU — s. A.3

  canvas?: CanvasApplicationOptions;
  loader?: LoaderOptions;
  rendering?: RenderingApplicationOptions;
  input?: InputApplicationOptions;
}
```

---

#### Umbenennung der Loader-Optionen (bestätigt)

`LoaderOptions` (in `Loader.ts`) erhält folgende Renames:

| Alt | Neu | Begründung |
|---|---|---|
| `resourcePath` | `basePath` | Kürzer, moderner; Vite/Astro nutzen `base` für dasselbe Konzept |
| `requestOptions` | `fetchOptions` | Mappt direkt auf `fetch(url, fetchOptions)` — `RequestInit` ist der korrekte Parametertyp |
| `cache` | unverändert | Klar genug |
| `cacheStrategy` | unverändert | Präzise |
| `concurrency` | unverändert | Klar |

```ts
// Loader.ts — LoaderOptions nach Umbenennung
export interface LoaderOptions {
  basePath?: string;
  fetchOptions?: RequestInit;
  cache?: CacheStore | readonly CacheStore[];
  cacheStrategy?: CacheStrategy;
  concurrency?: number;
}
```

`ApplicationOptions.loader` verweist direkt auf `LoaderOptions` — kein separates `LoaderApplicationOptions`-Interface.

---

#### `_ownsLoader`-Muster: explizit abgelehnt

Die Idee, `ApplicationOptions.loader` als `Loader | LoaderOptions`-Union zu akzeptieren, um borrowed/owned-Semantik zu ermöglichen, wurde verworfen.

**Begründung:** `_ownsLoader: boolean` ist ein unsichtbarer impliziter Vertrag. Zwei syntaktisch ähnliche Aufrufe (`loader: { basePath }` vs. `loader: myLoaderInstance`) würden sich in `app.destroy()` grundlegend unterschiedlich verhalten — ohne TypeScript-sichtbare Garantie und ohne Laufzeit-Indikation. Das widerspricht ExoJS' explizitem, Low-Magic-Anspruch direkt.

**Entscheidung:** Application besitzt immer einen eigenen Loader. `loader` in `ApplicationOptions` akzeptiert ausschließlich `LoaderOptions`. Alle mutable Loader-Properties (`basePath`, `fetchOptions`, `concurrency`) sind zusätzlich post-construction über `app.loader.*` erreichbar.

---

#### `fpsLimit` und `backgroundFpsLimit` (bestätigt, zu implementieren)

Beide als mutable Properties auf `Application` (analog zu `pauseOnHidden`) und gleichzeitig als `ApplicationOptions`-Felder:

```ts
// ApplicationOptions
fpsLimit?: number;           // 0 = unbegrenzt (Standard)
backgroundFpsLimit?: number; // 0 = kein separates Limit (Standard)

// Application — mutable nach Construction
app.fpsLimit = 60;
app.backgroundFpsLimit = 10;
```

**Implementierung im Update-Loop:**

`_updateHandler` wird timestamp-aware (`requestAnimationFrame` übergibt bereits einen `DOMHighResTimeStamp`, der aktuell ignoriert wird):

```typescript
private readonly _updateHandler: (timestamp: number) => void;
private _lastFrameTimestamp = 0;

public update(timestamp = performance.now()): this {
  if (this._status === ApplicationStatus.Running) {

    // Hintergrund-FPS-Limit (greift auch wenn pauseOnHidden = false)
    if (!this._documentVisible && this.backgroundFpsLimit > 0) {
      if (timestamp - this._lastFrameTimestamp < 1000 / this.backgroundFpsLimit) {
        this._frameRequest = requestAnimationFrame(this._updateHandler);
        return this;
      }
    }

    // Normales pauseOnHidden — unverändert
    if (this.pauseOnHidden && !this._documentVisible) {
      this._frameRequest = requestAnimationFrame(this._updateHandler);
      return this;
    }

    // Globaler FPS-Limit
    if (this.fpsLimit > 0) {
      if (timestamp - this._lastFrameTimestamp < 1000 / this.fpsLimit) {
        this._frameRequest = requestAnimationFrame(this._updateHandler);
        return this;
      }
    }

    this._lastFrameTimestamp = timestamp;
    // ... restlicher Update-Code unverändert
  }
}
```

---

### A.2 Identifizierte Lücken (zu implementieren mit dem Redesign)

Über `pixelRatio`, `fpsLimit` und `backgroundFpsLimit` hinaus wurden weitere fehlende Optionen identifiziert:

#### `canvas.pixelRatio` — HiDPI-Unterstützung

Bisher vollständig Nutzeraufgabe (Guide `resize-and-dpr` zeigt manuelle Handhabung). Implementierung im Konstruktor:

```typescript
const { width = 800, height = 600, pixelRatio = 1, tabIndex = -1, imageRendering } = options.canvas ?? {};
const renderWidth = Math.round(width * pixelRatio);
const renderHeight = Math.round(height * pixelRatio);

canvas.width = renderWidth;
canvas.height = renderHeight;
canvas.style.width = `${width}px`;
canvas.style.height = `${height}px`;

if (imageRendering) {
  canvas.style.imageRendering = imageRendering;
}
```

`app.resize(w, h)` muss das gespeicherte `pixelRatio` berücksichtigen.

#### `canvas.imageRendering` — CSS-Rendering-Hint

Für Pixel-Art-Spiele ist `image-rendering: pixelated` essenziell, damit der Browser beim Canvas-Upscaling keine Bilinear-Interpolation anwendet. Bisher ebenfalls Nutzeraufgabe ohne Engine-Unterstützung.

#### `canvas.tabIndex` — konfigurierbar statt hardcodiert

Aktuell wird `tabindex="-1"` gesetzt wenn kein tabindex vorhanden. Manche Anwendungen benötigen `tabindex="0"` für Accessibility oder andere Werte. Sollte konfigurierbar sein.

#### `maxDeltaMs` — Delta-Capping gegen den „Spiral of Death"

**Bisher komplett fehlend und relevant für Spielstabilität.** Wenn ein Tab nach langer Hintergrundpause zurückkehrt (und `pauseOnHidden = false`), bekommt `update()` einen Frame-Delta von möglicherweise mehreren Sekunden. In Physik- und Animationssystemen führt das zu „Zeitsprüngen". Viele Game-Engines cappen den Delta-Wert:

```ts
// ApplicationOptions
maxDeltaMs?: number; // Standard: unbegrenzt (0); empfohlen: ~100

// Wäre ein mutable Property wie pauseOnHidden:
app.maxDeltaMs = 100;
```

Implementierung: `frameDelta` wird vor dem Dispatch an `sceneManager.update()` und `tweens.update()` auf `maxDeltaMs` geklemmt. Das ist eine rein lokale Änderung im Update-Loop.

#### `cacheStrategy` und `concurrency` in `LoaderOptions` — waren bisher nicht durchgereicht

Bereits in Abschnitt 3.2 identifiziert, aber hier zur Vollständigkeit: Die bestehende `LoaderOptions` akzeptiert beide Felder — `ApplicationOptions` leitete sie bisher stillschweigend nicht weiter. Das wird mit dem Redesign behoben.

---

### A.3 Noch offene Entscheidungen

#### Keinen app-eigenen Default-Loader mehr?

**Vorschlag (noch nicht entschieden):** Application besitzt keinen eigenen Loader mehr. Der Nutzer erstellt und zerstört den Loader selbst. Szenen-Lifecycle-Hooks würden den Loader explizit übergeben bekommen — möglicherweise via `app.start(scene, loader)`.

**Pro:**
- Klare Lifecycle-Verantwortung beim Nutzer
- `ApplicationOptions.loader` entfällt komplett
- Kein Ownership-Problem

**Contra:**
- `scene.load(loader)` / `scene.init(loader)` / `scene.unload(loader)` — Signatur unverändert, aber wer stellt den Loader bereit?
- Der 99%-Fall (`app.loader.load(...)` in Szenen) wird komplizierter, wenn der Loader nicht automatisch existiert
- Größere API-Änderung als der reine `ApplicationOptions`-Umbau
- `app.loader` als prominente Public Property würde entfallen oder nullable werden

**Derzeitige Einschätzung:** Architektonisch reizvoll, aber der ergonomische Preis für den Standard-Use-Case ist hoch. Die Entscheidung sollte nicht zusammen mit dem `ApplicationOptions`-Redesign getroffen werden — separater Scope.

#### Weitere Options aus ApplicationOptions herausnehmen?

**Vorschlag (noch nicht entschieden):** Weitere Optionen die technisch post-construction mutierbar sind (`clearColor`, ggf. `rendering`-Gruppe) könnten aus dem Konstruktor entfernt und rein als Post-Construction-API angeboten werden.

**Derzeitige Einschätzung:** Nicht empfohlen. `clearColor` ist in jedem Tutorial-Beispiel präsent. Optionen die bequem im Konstruktor gesetzt werden können, sollten dort bleiben — auch wenn eine post-construction Alternative existiert. Schlanker um ihrer selbst willen ist kein Ziel.

---

### A.4 Konsolidierte Ziel-API (Stand: nach Nachgespräch)

```ts
export interface ApplicationOptions {
  // ── Top-Level ─────────────────────────────────────────────────────────────
  clearColor?: Color;
  backend?: BackendConfig;
  fpsLimit?: number;           // 0 = unbegrenzt
  backgroundFpsLimit?: number; // 0 = kein separates Limit
  maxDeltaMs?: number;         // 0 = unbegrenzt; empfohlen: 100 für Spiele

  // ── Subsystem-Gruppen ─────────────────────────────────────────────────────
  canvas?: CanvasApplicationOptions;
  loader?: LoaderOptions;               // direkt LoaderOptions aus Loader.ts
  rendering?: RenderingApplicationOptions;
  input?: InputApplicationOptions;
}

export interface CanvasApplicationOptions {
  element?: HTMLCanvasElement;
  width?: number;                       // Standard: 800
  height?: number;                      // Standard: 600
  pixelRatio?: number;                  // Standard: 1
  tabIndex?: number;                    // Standard: -1
  imageRendering?: 'auto' | 'pixelated' | 'crisp-edges'; // Standard: 'auto'
}

// In Loader.ts — nach Umbenennung:
export interface LoaderOptions {
  basePath?: string;                    // war: resourcePath
  fetchOptions?: RequestInit;           // war: requestOptions
  cache?: CacheStore | readonly CacheStore[];
  cacheStrategy?: CacheStrategy;
  concurrency?: number;                 // Standard: 6
}

export interface RenderingApplicationOptions {
  debug?: boolean;                      // WebGL2-only
  webglAttributes?: WebGLContextAttributes; // WebGL2-only
  spriteRendererBatchSize?: number;     // WebGL2-only, Standard: 4096
  particleRendererBatchSize?: number;   // WebGL2-only, Standard: 8192
}

export interface InputApplicationOptions {
  gamepadDefinitions?: GamepadDefinition[];
  gamepadSlotStrategy?: GamepadSlotStrategy; // Standard: 'sticky'
  pointerDistanceThreshold?: number;    // Standard: 10
}
```

**Mutable Properties auf `Application` (zusätzlich zu `ApplicationOptions`):**

```ts
app.fpsLimit           // = 0
app.backgroundFpsLimit // = 0
app.maxDeltaMs         // = 0
app.pauseOnHidden      // = false (unverändert)
```
