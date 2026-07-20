# SceneDirector Rename + Pause API (v0.17 Slice C) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename `SceneManager` → `SceneDirector` and `Application.scene` → `Application.scenes` across the whole repo, then add the pause API (`pause()`/`resume()`, `onPause`/`onResume`/`onStateChange`, paused-but-drawing semantics) specified as Slice C of `.workspace/specs/v0.17-core-runtime-model/04-implementation-spec.md` §17.

**Architecture:** `SceneState.Paused` and the `canPause`/`canResume` guards already exist (`src/core/SceneState.ts`, shipped in Slice B). This slice (1) mechanically renames the class/property everywhere it's referenced — engine core, tests, the `exojs-react` package, the two example files, and the guide docs that mention it — and (2) adds real pause/resume behaviour on top of the existing `SceneScope`/`SceneManager` split: `SceneScope` owns the state transition, `SceneDirector` (renamed) owns the public signals.

**Tech Stack:** TypeScript, Vitest, the existing Signal/SystemRegistry/SceneScope primitives already in `src/core`.

## Global Constraints

- Pre-1.0 breaking changes are clean breaks — no deprecated aliases, no compat shims (`project-pre-1.0-no-backcompat` convention). Do not add `export { SceneDirector as SceneManager }`.
- Mechanical renames are done by hand/script in this session, never delegated to a subagent (`feedback-mechanical-refactors` convention).
- `packages/exojs-bench/src/rendering/adapters/phaser.ts` and `packages/exojs-bench/src/rendering/report.ts` contain **unrelated** references to `Phaser`'s own `SceneManager` — do not touch them.
- `site/src/content/guide/shipping/v0-8-x-to-v0-9-0.mdx` is a frozen historical migration record (it documents the v0.8→v0.9 rename `app.sceneManager` → `app.scene`) — do not touch it.
- API docs under `site/src/content/api/*.json` are generated from JSDoc via `pnpm docs:api:generate` — never hand-edit them.
- Examples ship a `.ts` source and an auto-generated `.js` twin (`// Auto-generated from X.ts — edit the .ts source, not this file.`) — only edit `.ts`, then regenerate `.js` via `pnpm --filter @codexo/exojs-examples examples:sync`.
- No writable `scene.paused` in the new API — it doesn't exist in the current `Scene` class (verified: only pause-name hits in `src/` are unrelated `Video`/`Tween`/`Playable` playback-paused flags). Nothing to remove; this is a pure addition.

---

## Task 1: Rename `SceneManager` → `SceneDirector`, `Application.scene` → `Application.scenes`

**Files:**

- Rename: `src/core/SceneManager.ts` → `src/core/SceneDirector.ts`
- Modify: `src/core/Application.ts:36,272,445,681,734,764,774,776,778,796,887,1098`
- Modify: `src/core/SceneScope.ts` (JSDoc-only `{@link SceneManager}` mentions)
- Modify: `src/core/index.ts`
- Modify: `src/debug/BoundingBoxesLayer.ts`, `src/debug/HitTestLayer.ts`, `src/debug/PerformanceLayer.ts`, `src/debug/PointerStackLayer.ts`, `src/debug/RenderPassInspectorLayer.ts`
- Modify: `src/input/FocusManager.ts`, `src/input/InteractionManager.ts`
- Modify: `src/ui/UIRoot.ts`
- Rename: `test/core/scene-manager.test.ts` → `test/core/scene-director.test.ts`
- Modify: `test/core/application-lifecycle.test.ts`, `test/core/application-loop.test.ts`, `test/core/application-on-frame.test.ts`, `test/core/application.test.ts`, `test/core/focus-visibility.test.ts`, `test/debug/debug-overlay.test.ts`, `test/input/interaction.test.ts`, `test/rendering/webgl2-backend.test.ts`

**Interfaces:**

- Produces: `class SceneDirector` (same shape as today's `SceneManager` — `currentScene`, `setScene`, `fixedUpdate`, `update`, `draw`, `_drawTransition`, `_beginFrame`, `_endFrame`, `destroy`, `onChangeScene`, `onStartScene`, `onUpdateScene`, `onStopScene`), exported from `src/core/index.ts` and `#core/SceneDirector`.
- Produces: `Application.scenes: SceneDirector` (was `Application.scene: SceneManager`).
- Consumed by Task 2 (adds `pause`/`resume`/`state`/`onPause`/`onResume`/`onStateChange` to this same class) and Task 3 (propagates the rename outward to `exojs-react` and the examples).

- [ ] **Step 1: Rename the file and the class**

```bash
git mv src/core/SceneManager.ts src/core/SceneDirector.ts
```

Then edit `src/core/SceneDirector.ts`:

- `export class SceneManager {` → `export class SceneDirector {`
- In the class doc comment (the block starting `Single-active-scene controller owned by {@link Application}...`), replace every `{@link SceneManager...}` with `{@link SceneDirector...}` and every prose mention of "SceneManager" with "SceneDirector" (5 occurrences: the class doc intro, `_prepareScene`'s log `source: 'SceneManager'`, `_unloadActiveSceneOnDestroy`'s log `source: 'SceneManager'`, the `destroy()` error message `'SceneManager was destroyed while a transition was active.'`, and the `SetSceneOptions`/`SceneTransition` doc links).
- The two `logger` calls' `source:` fields become `source: 'SceneDirector'`.
- The thrown error text becomes `'SceneDirector was destroyed while a transition was active.'`.

- [ ] **Step 2: Rename `Application.scene` to `Application.scenes`**

Edit `src/core/Application.ts`:

```ts
// line 36 — import
import { SceneDirector } from './SceneDirector';
```

```ts
// line 272 — property declaration
public readonly scenes: SceneDirector;
```

```ts
// line 445 — construction
this.scenes = new SceneDirector(this);
```

Then update every remaining `this.scene.` call site to `this.scenes.` (lines 681, 734, 764, 774, 776, 778, 796, 887, 1098) and the JSDoc prose at lines ~247, 282, 303, 308, 663, 707-712, 816, 879, 1072 that says "scene manager" / "SceneManager" — reword to "scene director" / "SceneDirector" respectively. Verify with:

```bash
grep -n "this\.scene\b\|SceneManager" src/core/Application.ts
```

Expected: no output.

- [ ] **Step 3: Fix `SceneScope.ts`'s doc-only mentions**

Edit `src/core/SceneScope.ts` — the class doc comment says `Not exported from the package root — Scene and SceneManager are the public surface`. Change to `Scene and SceneDirector are the public surface`. Verify:

```bash
grep -n "SceneManager" src/core/SceneScope.ts
```

Expected: no output.

- [ ] **Step 4: Update `src/core/index.ts`'s export**

```bash
grep -n "SceneManager" src/core/index.ts
```

Change the matched export line from `SceneManager` to `SceneDirector` (same export style/position — `export { SceneDirector } from './SceneDirector';` or equivalent, matching whatever form the existing line uses).

- [ ] **Step 5: Scripted rename across the remaining `src/` consumers**

These 8 files only reference `this._app.scene` / `app.scene` (as a plain property read, e.g. `this._app.scene.currentScene`) and the bare `SceneManager` type name — both patterns are safe to replace mechanically here (verified no other meaning of `.scene` exists in any of these files):

```bash
for f in src/debug/BoundingBoxesLayer.ts src/debug/HitTestLayer.ts src/debug/PerformanceLayer.ts \
         src/debug/PointerStackLayer.ts src/debug/RenderPassInspectorLayer.ts \
         src/input/FocusManager.ts src/input/InteractionManager.ts src/ui/UIRoot.ts; do
  sed -i -E 's/\bSceneManager\b/SceneDirector/g; s/app\.scene\b/app.scenes/g' "$f"
done
```

Verify:

```bash
grep -rn "SceneManager\b\|app\.scene\b" src/debug src/input/FocusManager.ts src/input/InteractionManager.ts src/ui/UIRoot.ts
```

Expected: no output.

- [ ] **Step 6: Rename and update the core test suite**

```bash
git mv test/core/scene-manager.test.ts test/core/scene-director.test.ts
```

Edit `test/core/scene-director.test.ts`: replace the import `import { SceneManager } from '#core/SceneManager';` with `import { SceneDirector } from '#core/SceneDirector';`, replace every `SceneManager` identifier use (constructor calls, type annotations like `manager: SceneManager` in the `tick` helper) with `SceneDirector`, and the `describe('SceneManager', ...)` block name with `describe('SceneDirector', ...)`. This file has no `app.scene` references (the test stub is the `Application`, not a consumer of it), so only the class-name rename applies here.

Then run the scripted rename across the other 8 test files, which only use the `SceneManager` type and `app.scene`/`_app.scene` property reads (verified no collision with any other `.scene` meaning in these files):

```bash
for f in test/core/application-lifecycle.test.ts test/core/application-loop.test.ts \
         test/core/application-on-frame.test.ts test/core/application.test.ts \
         test/core/focus-visibility.test.ts test/debug/debug-overlay.test.ts \
         test/input/interaction.test.ts test/rendering/webgl2-backend.test.ts; do
  sed -i -E 's/\bSceneManager\b/SceneDirector/g; s/app\.scene\b/app.scenes/g' "$f"
done
```

Verify:

```bash
grep -rln "SceneManager\b\|app\.scene\b" test/core test/debug/debug-overlay.test.ts test/input/interaction.test.ts test/rendering/webgl2-backend.test.ts
```

Expected: no output.

- [ ] **Step 7: Typecheck and run the affected test files**

```bash
pnpm typecheck
```

Expected: no errors.

```bash
pnpm vitest run test/core test/debug/debug-overlay.test.ts test/input/interaction.test.ts test/rendering/webgl2-backend.test.ts
```

Expected: all pass (test names/content are unchanged — only symbol names changed).

- [ ] **Step 8: Commit**

```bash
git add src/core/SceneDirector.ts src/core/Application.ts src/core/SceneScope.ts src/core/index.ts \
        src/debug src/input/FocusManager.ts src/input/InteractionManager.ts src/ui/UIRoot.ts \
        test/core test/debug/debug-overlay.test.ts test/input/interaction.test.ts test/rendering/webgl2-backend.test.ts
git status --short  # confirm src/core/SceneManager.ts shows as deleted, src/core/SceneDirector.ts as added
git commit -m "$(cat <<'EOF'
refactor(core)!: rename SceneManager to SceneDirector, app.scene to app.scenes

Aligns the public surface with the v0.17 core runtime model spec's target
module structure ahead of the pause API landing on this class.
EOF
)"
```

---

## Task 2: Pause API on `SceneScope` / `SceneDirector` (TDD)

**Files:**

- Modify: `src/core/SceneScope.ts`
- Modify: `src/core/SceneDirector.ts`
- Test: `test/core/scene-director.test.ts`

**Interfaces:**

- Consumes: `SceneState`, `canPause(state)`, `canResume(state)` from `./SceneState` (all already exist, unchanged).
- Produces: `SceneScope.pause(): boolean`, `SceneScope.resume(): boolean` (used only by `SceneDirector`, not part of the public API surface). `SceneDirector.pause(): boolean`, `SceneDirector.resume(): boolean`, `SceneDirector.state: SceneState | null` (getter), `SceneDirector.onPause: Signal<[Scene]>`, `SceneDirector.onResume: Signal<[Scene]>`, `SceneDirector.onStateChange: Signal<[SceneState, SceneState, Scene]>`.

- [ ] **Step 1: Write the failing tests**

Append to `test/core/scene-director.test.ts` (inside the existing `describe('SceneDirector', ...)` block, after the last existing test):

```ts
test('pause() transitions Active to Paused, dispatches onPause and onStateChange, and stops update but not draw', async () => {
  const app = createApplicationStub();
  const director = new SceneDirector(app);
  const update = vi.fn();
  const draw = vi.fn();
  const scene = makeScene({ update, draw });
  const onPause = vi.fn();
  const onStateChange = vi.fn();

  director.onPause.add(onPause);
  director.onStateChange.add(onStateChange);

  await director.setScene(scene);

  expect(director.pause()).toBe(true);
  expect(director.state).toBe(SceneState.Paused);
  expect(onPause).toHaveBeenCalledTimes(1);
  expect(onPause).toHaveBeenCalledWith(scene);
  expect(onStateChange).toHaveBeenCalledTimes(1);
  expect(onStateChange).toHaveBeenCalledWith(SceneState.Active, SceneState.Paused, scene);

  tick(director, app);
  expect(update).not.toHaveBeenCalled();
  expect(draw).toHaveBeenCalledTimes(1);
});

test('pause() is a no-op when no scene is active', () => {
  const director = new SceneDirector(createApplicationStub());

  expect(director.pause()).toBe(false);
  expect(director.state).toBeNull();
});

test('pause() is a no-op when the active scene is already paused', async () => {
  const app = createApplicationStub();
  const director = new SceneDirector(app);
  const onPause = vi.fn();

  await director.setScene(makeScene({}));
  director.pause();
  director.onPause.add(onPause);

  expect(director.pause()).toBe(false);
  expect(onPause).not.toHaveBeenCalled();
});

test('resume() transitions Paused back to Active, dispatches onResume and onStateChange, and restores update', async () => {
  const app = createApplicationStub();
  const director = new SceneDirector(app);
  const update = vi.fn();
  const scene = makeScene({ update });
  const onResume = vi.fn();
  const onStateChange = vi.fn();

  await director.setScene(scene);
  director.pause();

  director.onResume.add(onResume);
  director.onStateChange.add(onStateChange);

  expect(director.resume()).toBe(true);
  expect(director.state).toBe(SceneState.Active);
  expect(onResume).toHaveBeenCalledTimes(1);
  expect(onResume).toHaveBeenCalledWith(scene);
  expect(onStateChange).toHaveBeenCalledTimes(1);
  expect(onStateChange).toHaveBeenCalledWith(SceneState.Paused, SceneState.Active, scene);

  tick(director, app);
  expect(update).toHaveBeenCalledTimes(1);
});

test('resume() is a no-op when the active scene is not paused', async () => {
  const app = createApplicationStub();
  const director = new SceneDirector(app);
  const onResume = vi.fn();

  await director.setScene(makeScene({}));
  director.onResume.add(onResume);

  expect(director.resume()).toBe(false);
  expect(onResume).not.toHaveBeenCalled();
});

test('state getter reflects the active scope and is null once cleared', async () => {
  const app = createApplicationStub();
  const director = new SceneDirector(app);

  expect(director.state).toBeNull();

  await director.setScene(makeScene({}));
  expect(director.state).toBe(SceneState.Active);

  await director.setScene(null);
  expect(director.state).toBeNull();
});
```

Add `SceneState` to the file's imports:

```ts
import { SceneState } from '#core/SceneState';
```

- [ ] **Step 2: Run the new tests to verify they fail**

```bash
pnpm vitest run test/core/scene-director.test.ts
```

Expected: FAIL — `director.pause is not a function` (and similarly for `resume`/`state`/`onPause`/`onResume`/`onStateChange`).

- [ ] **Step 3: Add `pause()`/`resume()` to `SceneScope` and fix the `draw()` gate**

Edit `src/core/SceneScope.ts` — extend the `SceneState` import:

```ts
import { canDestroy, canPause, canResume, SceneState } from './SceneState';
```

Add two public methods, placed after `activate()`:

```ts
  /** Pause this scope: `Active` → `Paused`. Returns whether the transition happened. */
  public pause(): boolean {
    if (!canPause(this._state)) {
      return false;
    }

    this._state = SceneState.Paused;

    return true;
  }

  /** Resume this scope: `Paused` → `Active`. Returns whether the transition happened. */
  public resume(): boolean {
    if (!canResume(this._state)) {
      return false;
    }

    this._state = SceneState.Active;

    return true;
  }
```

Change `draw()`'s gate (currently `if (this._state !== SceneState.Active) { return; }`) to also allow `Paused`:

```ts
  public draw(context: RenderingContext): void {
    if (this._state !== SceneState.Active && this._state !== SceneState.Paused) {
      return;
    }
    // ... unchanged body
```

Leave `fixedUpdate()` and `update()` untouched — both already gate on `!== SceneState.Active`, which is exactly the wanted "fixed/update stop, draw keeps running" behaviour for `Paused`.

- [ ] **Step 4: Add `pause()`/`resume()`/`state`/signals to `SceneDirector`**

Edit `src/core/SceneDirector.ts` — add the `SceneState` import:

```ts
import { SceneState } from './SceneState';
```

Add three signals next to the existing four (`onChangeScene`, `onStartScene`, `onUpdateScene`, `onStopScene`):

```ts
  /** Fires after `pause()` actually transitions the active scene to `Paused`. */
  public readonly onPause = new Signal<[Scene]>();
  /** Fires after `resume()` actually transitions the active scene back to `Active`. */
  public readonly onResume = new Signal<[Scene]>();
  /** Fires whenever the active scene's {@link SceneState} changes, as `(previous, next, scene)`. */
  public readonly onStateChange = new Signal<[SceneState, SceneState, Scene]>();
```

Add the `state` getter next to `currentScene`:

```ts
  /** The active scene's current {@link SceneState}, or `null` when no scene is active. */
  public get state(): SceneState | null {
    return this._activeScope?.state ?? null;
  }
```

Add `pause()`/`resume()` methods (placed after `setScene`):

```ts
  /**
   * Pause the active scene: `Active` → `Paused`. Its `fixedUpdate`/`update`
   * stop running, but `draw` keeps rendering and input/interaction stay live
   * — the canonical "pause menu drawn over a frozen world" shape. No-op
   * (returns `false`) when no scene is active or it is not currently `Active`.
   */
  public pause(): boolean {
    const scope = this._activeScope;

    if (scope === null) {
      return false;
    }

    const previous = scope.state;
    const changed = scope.pause();

    if (changed) {
      this.onPause.dispatch(scope.scene);
      this.onStateChange.dispatch(previous, scope.state, scope.scene);
    }

    return changed;
  }

  /**
   * Resume a paused scene: `Paused` → `Active`. No-op (returns `false`) when
   * no scene is active or it is not currently `Paused`.
   */
  public resume(): boolean {
    const scope = this._activeScope;

    if (scope === null) {
      return false;
    }

    const previous = scope.state;
    const changed = scope.resume();

    if (changed) {
      this.onResume.dispatch(scope.scene);
      this.onStateChange.dispatch(previous, scope.state, scope.scene);
    }

    return changed;
  }
```

Add the three new signals to `destroy()`, next to the existing four:

```ts
this.onPause.destroy();
this.onResume.destroy();
this.onStateChange.destroy();
```

- [ ] **Step 5: Run the tests to verify they pass**

```bash
pnpm vitest run test/core/scene-director.test.ts
```

Expected: PASS (all tests, including the pre-existing ones from Task 1).

- [ ] **Step 6: Typecheck and run the full core test directory**

```bash
pnpm typecheck && pnpm vitest run test/core
```

Expected: no errors, all pass.

- [ ] **Step 7: Commit**

```bash
git add src/core/SceneScope.ts src/core/SceneDirector.ts test/core/scene-director.test.ts
git commit -m "$(cat <<'EOF'
feat(core)!: SceneDirector pause/resume API

Adds pause()/resume() plus onPause/onResume/onStateChange signals.
SceneScope.draw() now runs in both Active and Paused so a pause overlay
can render over a frozen world; fixedUpdate/update stay Active-only.
EOF
)"
```

---

## Task 3: Propagate the rename to `exojs-react` and the examples

**Files:**

- Modify: `packages/exojs-react/src/useScene.ts`
- Modify: `packages/exojs-react/test/support/mock-application.ts`
- Modify: `packages/exojs-react/test/useScene.test.tsx`, `packages/exojs-react/test/Scenes.test.tsx`
- Modify: `examples/application-scenes/multiple-scenes.ts`, `examples/showcase/orb-dodge.ts`
- Modify: `examples/application-scenes/pause-and-resume.ts` (real pause API replaces the local `frozen` workaround)

**Interfaces:**

- Consumes: `SceneDirector`/`app.scenes` and `SceneDirector.pause()`/`resume()` from Task 1/2.
- Produces: nothing new — this task only propagates already-defined symbols outward.

- [ ] **Step 1: Rename in `exojs-react`'s hook and its own mock**

`packages/exojs-react/src/useScene.ts` only reads `app.scene.setScene(...)` (the local `app` var, safe pattern) plus JSDoc prose — apply the scripted rename:

```bash
sed -i -E 's/app\.scene\b/app.scenes/g' packages/exojs-react/src/useScene.ts
```

`packages/exojs-react/test/support/mock-application.ts` mocks `Application` itself, so its `scene` property is self-referential (`this.scene`, not `app.scene`) and needs a manual edit. Rename the interface and the property:

```ts
interface MockSceneDirector {
  current: unknown;
  setScene: ReturnType<typeof vi.fn>;
}
```

```ts
  public readonly scenes: MockSceneDirector = {
    current: null,
    setScene: vi.fn(async (scene: unknown): Promise<MockSceneDirector> => {
      this.scenes.current = scene;
      return this.scenes;
    }),
  };

  public readonly start = vi.fn(async (scene: unknown): Promise<MockApplication> => {
    this.status = status.running;
    this.scenes.current = scene;
    return this;
  });
```

- [ ] **Step 2: Rename in the `exojs-react` test files**

These reference `app.scene.setScene(...)` through the local `app` var returned by the mock — safe scripted rename:

```bash
for f in packages/exojs-react/test/useScene.test.tsx packages/exojs-react/test/Scenes.test.tsx; do
  sed -i -E 's/app\.scene\b/app.scenes/g' "$f"
done
```

Verify no stray references remain anywhere in the package (excluding `dist/`, which is rebuilt, not hand-edited):

```bash
grep -rn "app\.scene\b\|SceneManager\b\|MockSceneManager\b" packages/exojs-react/src packages/exojs-react/test
```

Expected: no output.

- [ ] **Step 3: Run the `exojs-react` package tests**

```bash
pnpm --filter @codexo/exojs-react test
```

Expected: all pass.

- [ ] **Step 4: Rename in the two affected example sources**

```bash
sed -i -E 's/\bSceneManager\b/SceneDirector/g; s/app\.scene\b/app.scenes/g' \
  examples/application-scenes/multiple-scenes.ts examples/showcase/orb-dodge.ts
```

Verify:

```bash
grep -n "SceneManager\b\|app\.scene\b" examples/application-scenes/multiple-scenes.ts examples/showcase/orb-dodge.ts
```

Expected: no output.

- [ ] **Step 5: Replace the `pause-and-resume` example's workaround with the real API**

Read `examples/application-scenes/pause-and-resume.ts` (current content already known — see plan header notes: it uses a scene-local `frozen` boolean with the comment "the same effect the director's pause() (a later engine slice) will provide"). Replace the whole file:

```ts
import { Application, Color, Keyboard, type RenderingContext, Scene, Sprite, Text, type Time } from '@codexo/exojs';

const app = new Application({
  canvas: {
    width: 1280,
    height: 720,
    mount: document.body,
    sizingMode: 'fit',
  },
  clearColor: Color.black,
  loader: {
    basePath: 'assets/',
  },
});

class PauseResumeScene extends Scene {
  private sprite!: Sprite;
  private label!: Text;

  override init(): void {
    const app = this.app;
    if (app === null) throw new Error('Scene.app is unavailable before the scene is attached to an Application.');
    const { width, height } = app.canvas;

    this.sprite = new Sprite(this.loader.get('image/ship-a.png'));
    this.sprite.setAnchor(0.5);
    this.sprite.setPosition(width / 2, height / 2);

    this.label = new Text('Space or click: pause update', { fillColor: Color.white, fontSize: 16 });
    this.label.setAnchor(0.5, 0);
    this.label.setPosition(width / 2, 16);

    this.inputs.onTrigger(Keyboard.Space, () => {
      this.toggle();
    });

    // Same toggle on click/tap so the pause works without a keyboard.
    app.input.onPointerTap.add(() => {
      this.toggle();
    });
  }

  private toggle(): void {
    if (this.app.scenes.state === 'paused') {
      this.app.scenes.resume();
    } else {
      this.app.scenes.pause();
    }

    this.label.text = this.app.scenes.state === 'paused' ? 'Paused (draw running)' : 'Running';
  }

  override update(delta: Time): void {
    this.sprite.rotate(delta.seconds * 180);
  }

  override draw(context: RenderingContext): void {
    context.backend.clear();
    context.render(this.sprite);
    context.render(this.label);
  }
}

app.start(new PauseResumeScene());
```

Note: `SceneState.Paused` serializes to the string `'paused'` (see `src/core/SceneState.ts`'s enum values) — the example compares against the string literal rather than importing the enum, matching this example's existing style of avoiding extra imports for a one-line comparison. If `typecheck:examples` rejects the bare string literal (the `state` getter's return type is the `SceneState` enum, not `string`), import and compare against `SceneState.Paused` instead:

```ts
import { Application, Color, Keyboard, type RenderingContext, Scene, SceneState, Sprite, Text, type Time } from '@codexo/exojs';
// ...
if (this.app.scenes.state === SceneState.Paused) {
```

- [ ] **Step 6: Regenerate the examples' `.js` twins**

```bash
pnpm --filter @codexo/exojs-examples examples:sync
```

Expected: `examples/application-scenes/multiple-scenes.js`, `examples/showcase/orb-dodge.js`, and `examples/application-scenes/pause-and-resume.js` are regenerated (git diff shows only these three `.js` files changed, matching the `.ts` edits).

- [ ] **Step 7: Typecheck examples and run the example smoke test**

```bash
pnpm typecheck:examples
```

Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add packages/exojs-react/src/useScene.ts packages/exojs-react/test \
        examples/application-scenes/multiple-scenes.ts examples/application-scenes/multiple-scenes.js \
        examples/showcase/orb-dodge.ts examples/showcase/orb-dodge.js \
        examples/application-scenes/pause-and-resume.ts examples/application-scenes/pause-and-resume.js
git commit -m "$(cat <<'EOF'
refactor(react)!: propagate SceneDirector/app.scenes rename; wire real pause API into the pause-and-resume example
EOF
)"
```

---

## Task 4: Guide docs, API docs regeneration, full verification gate

**Files:**

- Modify: `site/src/content/guide/runtime/application.mdx`
- Modify: `site/src/content/guide/runtime/scenes-and-lifecycle.mdx`
- Modify: `site/src/content/guide/integrations/react.mdx`, `site/src/content/guide/recipes/build-orb-dodge.mdx`, `site/src/content/guide/recipes/cinematics.mdx`, `site/src/content/guide/recipes/pause-menu.mdx`
- Regenerate: `site/src/content/api/scene-manager.json` → `site/src/content/api/scene-director.json` (via `docs:api:generate`, not by hand)

**Interfaces:**

- Consumes: everything from Tasks 1-3 (this task only documents the already-implemented API).

- [ ] **Step 1: Scripted rename across the four docs that mention `app.scene`/`SceneManager` only in passing**

```bash
for f in site/src/content/guide/integrations/react.mdx \
         site/src/content/guide/recipes/build-orb-dodge.mdx \
         site/src/content/guide/recipes/cinematics.mdx \
         site/src/content/guide/recipes/pause-menu.mdx; do
  sed -i -E 's/\bSceneManager\b/SceneDirector/g; s/app\.scene\b/app.scenes/g' "$f"
done
```

Verify:

```bash
grep -n "SceneManager\b\|app\.scene\b" site/src/content/guide/integrations/react.mdx \
  site/src/content/guide/recipes/build-orb-dodge.mdx site/src/content/guide/recipes/cinematics.mdx \
  site/src/content/guide/recipes/pause-menu.mdx
```

Expected: no output.

- [ ] **Step 2: `application.mdx` — rename plus the API link slug**

Apply the scripted rename first:

```bash
sed -i -E 's/\bSceneManager\b/SceneDirector/g; s/app\.scene\b/app.scenes/g' site/src/content/guide/runtime/application.mdx
```

Then fix the one remaining URL slug by hand (line ~160, kebab-case, not caught by the `SceneManager` word-boundary regex):

```
- `app.scene` — the [`SceneManager`](/ExoJS/en/api/scene-manager/) that holds the single active scene; switch scenes via `setScene` (with optional fade).
```

becomes:

```
- `app.scenes` — the [`SceneDirector`](/ExoJS/en/api/scene-director/) that holds the single active scene; switch scenes via `setScene` (with optional fade).
```

- [ ] **Step 3: `scenes-and-lifecycle.mdx` — rename the passing mentions**

Apply the scripted rename for the non-pause mentions (lines ~56, 60, 63, 68, 310):

```bash
sed -i -E 's/app\.scene\b/app.scenes/g' site/src/content/guide/runtime/scenes-and-lifecycle.mdx
```

- [ ] **Step 4: `scenes-and-lifecycle.mdx` — rewrite the pause section to the real API**

The current prose (lines ~96-127) and closing note (line ~322) describe a `scene.paused = true` writable property that never existed in this codebase — the linked example (`pause-and-resume.ts`) already said as much in its own comment before Task 3 rewrote it ("the same effect the director's pause() (a later engine slice) will provide"). Replace the section that currently reads:

```
To freeze a scene without leaving it — the canonical pause menu — set `scene.paused = true`. The SceneManager skips `update()` and the scene's systems while paused, but the scene keeps drawing. Set it back to `false` to resume.

A pause overlay is just nodes on `scene.ui` that you show and hide together with `scene.paused`:
```

with:

```
To freeze a scene without leaving it — the canonical pause menu — call `app.scenes.pause()`. It stops `update()` and the scene's systems, but the scene keeps drawing. Call `app.scenes.resume()` to resume.

A pause overlay is just nodes on `scene.ui` that you show and hide in response to the state change:
```

and replace the code sample's toggle body (currently `this.paused = !this.paused; this.pausePanel.visible = this.paused; this.pauseLabel.visible = this.paused;`) with:

```ts
if (this.app.scenes.state === SceneState.Paused) {
  this.app.scenes.resume();
} else {
  this.app.scenes.pause();
}

const paused = this.app.scenes.state === SceneState.Paused;
this.pausePanel.visible = paused;
this.pauseLabel.visible = paused;
```

adding `SceneState` to that snippet's import line. Finally replace the closing note (line ~322):

```
`scene.paused` gates `update`; `draw` keeps running. A pause overlay on `scene.ui` is toggled in sync so the player sees a menu while the world freezes.
```

with:

```
`app.scenes.pause()`/`resume()` gate `update`; `draw` keeps running. A pause overlay on `scene.ui` is toggled in sync so the player sees a menu while the world freezes.
```

- [ ] **Step 5: Typecheck the guides**

```bash
pnpm typecheck:guides
```

Expected: no errors. This extracts and typechecks every guide code block, including the rewritten pause snippet — it will catch a mismatched `SceneState` import or an `app.scenes` typo.

- [ ] **Step 6: Regenerate the API docs**

```bash
pnpm docs:api:generate
```

Expected: `site/src/content/api/scene-manager.json` is removed and `site/src/content/api/scene-director.json` is generated in its place (and any other JSON files that reference the renamed symbol are regenerated with the new name).

```bash
git status --short site/src/content/api
```

Expected: shows the `scene-manager.json` → `scene-director.json` rename plus any regenerated files that link to it.

- [ ] **Step 7: Full verification gate**

```bash
pnpm typecheck && pnpm lint && pnpm test
```

Expected: all green. This is the first full-repo run in this slice — everything up to now was scoped to the directly affected files.

- [ ] **Step 8: Commit**

```bash
git add site/src/content/guide site/src/content/api
git commit -m "$(cat <<'EOF'
docs(core)!: update guides for SceneDirector/app.scenes, document the real pause() API, regenerate API docs
EOF
)"
```

---

## Self-Review Notes

- **Spec coverage (§17 Slice C):** enum state — already shipped in Slice B, reused as-is (Task 2). Remove writable `paused` — verified none exists; nothing to remove (noted in Global Constraints). Director pause/resume — Task 2. State signals — Task 2 (`onPause`/`onResume`/`onStateChange`). Paused draw semantics — Task 2 Step 3 (`SceneScope.draw()` gate fix). Tests — Task 2 Steps 1-2. Migration docs — Task 4. The `SceneManager`→`SceneDirector`/`app.scene`→`app.scenes` rename (spec §16.1, listed under "Migration plan" rather than a numbered slice) is folded into Task 1/3/4 since Slice C's `director.pause()` naturally lands on the renamed class.
- **Placeholder scan:** every scripted step gives the exact `sed`/`grep`/`pnpm` command; every manual-edit step gives the exact before/after text or full file body. No "add appropriate handling" language.
- **Type consistency:** `SceneScope.pause()`/`resume()` return `boolean` and are consumed by `SceneDirector.pause()`/`resume()`, which also return `boolean` — matches the test assertions in Task 2 Step 1. `SceneDirector.state` returns `SceneState | null`, matching the test's `toBeNull()`/`toBe(SceneState.Active)` assertions and the `pause-and-resume.ts` example's comparison in Task 3.
