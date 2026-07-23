# Scene Transition & Lifecycle — Slice 8: Migration, Documentation & Full Verification — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close out the scene-transition/lifecycle redesign (Slices 1–7, all merged): sweep every non-`src`/`test` corner of the repo (`examples/`, `site/`, `packages/exojs-react`, `packages/create-exo-app`) onto the new `change()`/`restore()`/`unload()`/`preload()` navigation API, class-based `SceneTransition`/`PhasedSceneTransition`, `Scene.onActivate`/`onSuspend`, and scene-key registry navigation; regenerate the API docs; write the `CHANGELOG.md` entry for the whole redesign; and run the full verification gate (`verify:quick` + the complete multi-project `pnpm test`) as the release gate for the entire 8-slice effort.

**Architecture:** No new engine behavior. Every task is either (a) a mechanical call-site rename in a file this slice owns outright (an example, a guide's fenced code block, a `packages/exojs-react` source or test file, a `create-exo-app` template), or (b) a generation/verification step (`docs:api:generate`, `docs:api:check`, `typecheck:examples`, `typecheck:guides`, `typecheck:packages`, `pnpm test`). The renames are uniform across every file: `setScene(Target, data?, options?)` → `change(Target, { data, transition, suspendCurrent })`; `restoreScene(Target, options?)` → `restore(Target, { transition, suspendCurrent })`; `releaseScene(Target)` → `unload(Target, { instance? })`; `retainCurrent` → `suspendCurrent`; `Scene.onLoad`/`onUnload` → `Scene.onActivate`/`onSuspend` (or simply deleted where the override hooks `load()`/`unload()` already cover the same need); the old `{ type: 'fade', duration: <seconds> }` transition config object → `new FadeSceneTransition({ duration: <ms> })` (a real class instance, milliseconds not seconds).

**Tech Stack:** TypeScript, Vitest, Astro (the guide site under `site/`), React (`@codexo/exojs-react`), the `examples/` catalog (`.ts` authoritative + generated `.js`), `@codexo/exojs-config`'s generated API-docs pipeline (`site/src/content/api/*.json`).

## Global Constraints

- Clean breaks only — no deprecated aliases, no shims (pre-1.0 policy). Every call site is rewritten to the new name; nothing keeps the old name working "for compatibility."
- This slice does not re-litigate or re-implement any Slice 1–7 design decision. If the repo-wide sweep (Task 1) turns up something that looks like a genuine design gap rather than a missed rename, the task stops and names the specific file/line plus a minimal proposed fix — it does not silently work around it or invent new engine behavior.
- Examples: **`.ts` files are the authoritative source; sibling `.js` files are auto-generated** by `pnpm --filter site examples:sync` (`site/scripts/sync-examples-static.ts`, invoked as `cd site && pnpm examples:sync && cd ..` from the repo root) and must be committed alongside the `.ts` edit — never hand-edit a `.js` example file.
- `site/src/content/api/*.json` are generated, never hand-edited. Regenerate via `pnpm docs:api:generate` (aliases to `pnpm site:build:api`, itself `pnpm --filter @codexo/exojs-examples build:api`); verify sync via `pnpm docs:api:check` (`tsx scripts/check-api-docs-sync.ts`).
- Every touched public method/type keeps this repo's JSDoc convention: lead with what+why in 2-4 lines, no noise `@param`/`@returns`, `@internal` for exported-but-not-public, cross-reference with `{@link}` (see `[[feedback-jsdoc-conventions]]`).
- `pnpm typecheck:examples` / `pnpm typecheck:guides` / `pnpm typecheck:packages` / `pnpm docs:api:check` / the full `pnpm test` all gate the final commit (the pre-push hook's `verify:quick` runs the first four) — Task 13 runs the entire gate explicitly so failures surface before the push, not during it.
- `CHANGELOG.md`'s existing `## [0.17.0] - Unreleased` section (lines 7–123 as of this plan's writing) already describes a _different_, already-merged v0.17 initiative (multiphase `System`, typed scene registry, pause, retention) using the OLD names (`setScene`/`restoreScene`/`releaseScene`/`retainCurrent`) this spec renames. Task 12 rewrites that section in place to describe the final, post-redesign API — it is not historical text to leave alone.
- `site/src/content/guide/shipping/v0-8-x-to-v0-9-0.mdx` is a versioned migration guide documenting an old (`v0.8`→`v0.9`) API rename — its `app.sceneManager.setScene(new TitleScene())` code block is deliberately historical (BEFORE/AFTER for a _different, already-released_ transition) and is explicitly **not** touched by this slice, exactly like `CHANGELOG.md`'s already-released version entries below the `[0.17.0]` section.

---

## File Structure

```text
examples/
├── application-scenes/
│   ├── multiple-scenes.ts / .js       (modified) — setScene → change
│   └── scene-lifecycle.ts / .js       (modified) — onLoad/onUnload → onActivate/onSuspend, fix async init()
└── showcase/
    └── orb-dodge.ts / .js             (modified) — setScene → change, data → { data }

packages/
├── exojs-react/
│   ├── src/Scenes.tsx                 (modified) — setScene → change, transition prop type, JSDoc
│   ├── src/useScene.ts                (modified) — setScene → change, JSDoc
│   ├── test/Scenes.test.tsx           (modified) — setScene → change throughout, FadeSceneTransition
│   ├── test/useScene.test.tsx         (modified) — setScene → change throughout
│   └── test/support/mock-application.ts (modified) — MockSceneDirector.setScene → change
└── create-exo-app/templates/game-starter/src/scenes/
    ├── GameScene.ts                   (modified) — setScene → change, { data }
    └── GameOverScene.ts               (modified) — setScene → change

site/src/content/guide/
├── runtime/scenes-and-lifecycle.mdx   (modified) — switching-scenes + lifecycle-hooks sections
├── runtime/application.mdx            (modified) — one setScene mention
├── recipes/pause-menu.mdx             (modified) — setScene → change, transition config → class
├── recipes/cinematics.mdx             (modified) — setScene → change throughout
├── recipes/build-orb-dodge.mdx        (modified) — prose setScene mentions
└── integrations/react.mdx             (modified) — setScene → change, transition example

site/src/content/api/*.json            (regenerated, not hand-edited)
CHANGELOG.md                           (modified) — rewrite the [0.17.0] Unreleased section
```

---

### Task 1: Repo-wide leftover-name audit

**Files:** None modified — audit only, produces the definitive list every later task works from.

- [ ] **Step 1: Grep the whole repo for every old name, scoped to the directories this slice can affect**

Run each of these from the repo root:

```bash
grep -rn "setScene\|restoreScene\|releaseScene\|retainCurrent" src/ test/ packages/ examples/ site/src/ CHANGELOG.md
```

```bash
grep -rn "SetSceneOptions\|RestoreSceneOptions\|resolveSetSceneArgs\|_rollbackSwitch\|InstantSceneTransition" src/ test/ packages/ examples/ site/src/ CHANGELOG.md
```

```bash
grep -rn "SceneState\.Paused\|canPause(\|canResume(" src/ test/ packages/ examples/ site/src/
```

```bash
grep -rn "\.onLoad\b\|\.onUnload\b" src/ test/ examples/ site/src/ packages/
```

- [ ] **Step 2: Reconcile hits against the expected list below**

Every hit from Step 1 must fall into exactly one of these buckets. Anything **not** on this list is a surprise — stop and investigate before continuing (it may be a genuine Slice 1–7 gap, not a Slice 8 sweep item; if so, name the file/line and the minimal fix rather than silently patching around it).

**Expected `setScene`/`restoreScene`/`releaseScene`/`retainCurrent` hits (fixed by Tasks 2–11 below):**

- `examples/application-scenes/multiple-scenes.ts` / `.js` (Task 2)
- `examples/showcase/orb-dodge.ts` / `.js` (Task 3)
- `packages/exojs-react/src/Scenes.tsx`, `src/useScene.ts` (Task 8)
- `packages/exojs-react/test/Scenes.test.tsx`, `test/useScene.test.tsx`, `test/support/mock-application.ts` (Task 8)
- `packages/create-exo-app/templates/game-starter/src/scenes/GameScene.ts`, `GameOverScene.ts` (Task 9)
- `site/src/content/guide/runtime/scenes-and-lifecycle.mdx`, `runtime/application.mdx`, `recipes/pause-menu.mdx`, `recipes/cinematics.mdx`, `recipes/build-orb-dodge.mdx`, `integrations/react.mdx` (Tasks 5–7, 10)
- `site/src/content/api/*.json` (`set-scene-args.json`, `set-scene-options.json`, `scene-director.json`, `retained-scene-conflict-error.json`, `retained-scene-not-found-error.json`, `restore-scene-options.json`, `concurrent-scene-navigation-error.json`, `application-options.json`) — generated, regenerated wholesale by Task 11, not hand-fixed.
- `CHANGELOG.md` lines 7–123 (the `[0.17.0] - Unreleased` section) — rewritten by Task 12, not a stray reference.

**Expected, deliberately excluded (do not touch):**

- `site/src/content/guide/shipping/v0-8-x-to-v0-9-0.mdx` — historical `v0.8`→`v0.9` migration doc, unrelated API generation (see Global Constraints).
- `CHANGELOG.md` below line 125 (`[0.15.2]` and earlier) — already-released version history.
- Anything under `docs/superpowers/plans/` or `.workspace/` — planning documents, not shipped code or docs; a grep scoped to the paths in Step 1 should not touch them anyway (neither is included in the grep), which is intentional — don't widen the grep to include them.

**Expected zero hits (confirms Slices 1–7 did their own job cleanly):**

- `SetSceneOptions`, `RestoreSceneOptions`, `resolveSetSceneArgs`, `_rollbackSwitch`, `InstantSceneTransition` anywhere in `src/`, `test/`, `packages/`, `examples/`, `site/src/` outside the generated API-doc JSON files already listed above.
- `SceneState.Paused`, `canPause(`, `canResume(` anywhere (these were never introduced by this spec — `Scene.onPause`/`onResume` are an orthogonal boolean flag, not state-machine values; a hit here means something reintroduced a state that was removed before Slice 1, which is a bug to fix in this slice, not a missed rename to sweep).
- `Scene.onLoad`/`Scene.onUnload` **outside** `examples/application-scenes/scene-lifecycle.ts`/`.js` — that file is Task 4's the "one stale example" the spec (§2, revision note) names explicitly; every other hit is a bug.

- [ ] **Step 3: Record the confirmed hit list**

No commit for this task — it is a checkpoint. Proceed to Task 2 only once every hit from Step 1 is accounted for by the buckets above.

---

### Task 2: `examples/application-scenes/multiple-scenes.ts` — `setScene` → `change`

**Files:**

- Modify: `examples/application-scenes/multiple-scenes.ts`
- Modify (generated): `examples/application-scenes/multiple-scenes.js`

**Interfaces:**

- Consumes: `SceneDirector.change<C>(target: C, options?: ChangeSceneOptions<InferSceneData<C>>): Promise<this>` (Slice 3).

- [ ] **Step 1: Rewrite the two navigation call sites**

In `examples/application-scenes/multiple-scenes.ts`, both scenes call `setScene` with no data — these are pure renames, no options-shape change needed.

`MenuScene.init()` currently has:

```ts
this.inputs.onTrigger(Keyboard.Space, () => {
  void app.scenes.setScene(GameScene);
});

this.onTap = () => {
  void app.scenes.setScene(GameScene);
};
```

Change both occurrences of `app.scenes.setScene(GameScene)` to `app.scenes.change(GameScene)`.

`GameScene.init()` currently has:

```ts
this.inputs.onTrigger(Keyboard.Escape, () => {
  void app.scenes.setScene(MenuScene);
});
```

Change to `app.scenes.change(MenuScene)`.

- [ ] **Step 2: Regenerate the `.js` sibling**

Run: `cd site && pnpm examples:sync && cd ..`
Expected: exits 0, rewrites `examples/application-scenes/multiple-scenes.js` with the `// Auto-generated from multiple-scenes.ts` header and the same three renamed call sites.

- [ ] **Step 3: Typecheck the example**

Run: `pnpm typecheck:examples`
Expected: no errors for this file.

- [ ] **Step 4: Lint the generated JS**

Run: `pnpm lint -- examples/application-scenes/multiple-scenes.js`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add examples/application-scenes/multiple-scenes.ts examples/application-scenes/multiple-scenes.js
git commit -m "fix(examples): migrate multiple-scenes to change() navigation (scene-transition slice 8)"
```

---

### Task 3: `examples/showcase/orb-dodge.ts` — `setScene` → `change` + data wrapping

**Files:**

- Modify: `examples/showcase/orb-dodge.ts`
- Modify (generated): `examples/showcase/orb-dodge.js`

**Interfaces:**

- Consumes: `SceneDirector.change<C>(target: C, options?: ChangeSceneOptions<InferSceneData<C>>): Promise<this>` (Slice 3). `GameOverData` (this file's own local interface, unchanged) becomes the `data` field of the options object rather than a bare second argument.

- [ ] **Step 1: Rewrite the game-over transition (data-carrying call)**

`PlayScene.update()` currently has:

```ts
if (gameEnded) {
  void app.scenes.setScene(GameOverScene, { score: this.score, time: this.elapsed });
  return;
}
```

Change to:

```ts
if (gameEnded) {
  void app.scenes.change(GameOverScene, { data: { score: this.score, time: this.elapsed } });
  return;
}
```

- [ ] **Step 2: Rewrite the restart transition (no-data call)**

`GameOverScene.init()` currently has:

```ts
const restart = (): void => {
  void app.scenes.setScene(PlayScene);
};
```

Change to:

```ts
const restart = (): void => {
  void app.scenes.change(PlayScene);
};
```

- [ ] **Step 3: Regenerate the `.js` sibling**

Run: `cd site && pnpm examples:sync && cd ..`
Expected: exits 0, rewrites `examples/showcase/orb-dodge.js`.

- [ ] **Step 4: Typecheck the example**

Run: `pnpm typecheck:examples`
Expected: no errors for this file (`{ data: { score, time } }` type-checks against `GameOverScene`'s `GameOverData` generic the same way the old bare-second-argument form did).

- [ ] **Step 5: Lint the generated JS**

Run: `pnpm lint -- examples/showcase/orb-dodge.js`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add examples/showcase/orb-dodge.ts examples/showcase/orb-dodge.js
git commit -m "fix(examples): migrate orb-dodge to change() navigation with wrapped data (scene-transition slice 8)"
```

---

### Task 4: `examples/application-scenes/scene-lifecycle.ts` — replace removed `onLoad`/`onUnload`, fix illegal `async init()`

**Files:**

- Modify: `examples/application-scenes/scene-lifecycle.ts`
- Modify (generated): `examples/application-scenes/scene-lifecycle.js`
- Modify: `site/src/content/guide/runtime/scenes-and-lifecycle.mdx` (its lifecycle-hooks-in-order prose, so the two stay consistent — folded into this task rather than Task 5 since both describe the exact same removed/added hooks)

**Context:** This is the "one stale example" the spec's revision note (§2) names explicitly as the sole other place `Scene.onLoad`/`onUnload` were used. It also has a pre-existing, unrelated bug this slice fixes while already touching the file: `override async init(): Promise<void>` is illegal under the (already-shipped, separate) v0.17 sync-`init()` rule — a `Promise`-returning `init()` is a dev-mode activation error at runtime (it type-checks today because a `void`-returning method signature structurally accepts a `Promise<void>`-returning override, so `typecheck:examples` does not catch it). Since this task already rewrites the file's `init()` body to drop the `onLoad`/`onUnload` registrations, split the async asset-touching comment work into `load()` and make `init()` synchronous in the same edit.

- [ ] **Step 1: Rewrite the scene class**

Replace the full file content of `examples/application-scenes/scene-lifecycle.ts`:

```ts
import { Application, Color, type RenderingContext, Scene, Text, Time, Timer } from '@codexo/exojs';

// The scene lifecycle hooks, in the order the engine calls them:
//   - `async load()`   — one-shot async setup, called once before `init()`.
//                        Fetch/await assets here (`await this.loader.load(...)`),
//                        then build the scene graph in `init()`.
//   - `init()`         — one-shot sync setup, called once `load()` resolves.
//                        Must be synchronous — async work belongs in `load()`.
//   - `destroy()`      — one-shot teardown, called once when the scene ends
//                        permanently.
// `fixedUpdate`/`update`/`draw` run every frame in between.
// Two signals bracket the same span from the outside: `onActivate` fires
// every time the scene transitions into `Active` (fresh activation, a
// consumed preload, or a restore from retention) and `onSuspend` fires when
// the scene is suspended for retention (not on permanent teardown) — a hook
// point for cross-cutting concerns (audio cues, analytics, HUD toggles) that
// shouldn't live inside `init`/`destroy` themselves.
class LifecycleScene extends Scene {
  private events!: string[];
  private counter = 0;
  private drawCount = 0;
  private timer!: Timer;
  private text!: Text;

  override async load(): Promise<void> {
    // This scene is procedural — nothing to fetch — but a real scene would
    // resolve its assets here before touching the scene graph, e.g.:
    //   const data = (await this.loader.load(Asset.kind('json', 'level.json'))) as LevelData;
    this.events = ['load'];
  }

  override init(): void {
    const app = this.app;
    if (app === null) throw new Error('Scene.app is unavailable before the scene is attached to an Application.');
    const { width, height } = app.canvas;

    this.events.push('init');

    this.onActivate.add(() => {
      this.events.push('onActivate');
    });

    this.onSuspend.add(() => {
      this.events.push('onSuspend');
    });

    this.timer = new Timer(Time.fromSeconds(1), true);

    this.text = new Text('', { fillColor: Color.white, fontSize: 18 });
    this.text.setAnchor(0.5);
    this.text.setPosition(width / 2, height / 2);
  }

  override update(): void {
    if (this.timer.expired) {
      this.counter++;
      this.events.push(`update ${this.counter}`);
      this.timer.restart();
    }
  }

  override draw(context: RenderingContext): void {
    this.drawCount++;
    context.backend.clear();
    this.text.text = [...this.events.slice(-8), `draw ${this.drawCount}`].join('\n');
    context.render(this.text);
  }

  override destroy(): void {
    // destroy() is the final teardown hook — no separate unload() step
    // needed here since this scene holds no scene-private assets.
    this.events.push('destroy');
  }
}

const app = new Application({
  scenes: { LifecycleScene },
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

app.start(LifecycleScene);
```

Note what changed beyond the direct rename: `super.destroy()` is dropped from `destroy()` (the base `Scene.destroy()` is already empty per the prior, separate v0.17 rework — calling it was harmless but unnecessary, and this file no longer has a reason to demonstrate calling it since it isn't demonstrating cleanup-hook chaining). `async init()` is split into `async load()` (procedural setup comment moved here) + sync `init()` (event log, signal registration, scene graph construction) — this is the fix for the illegal `Promise`-returning `init()` described above.

- [ ] **Step 2: Regenerate the `.js` sibling**

Run: `cd site && pnpm examples:sync && cd ..`
Expected: exits 0, rewrites `examples/application-scenes/scene-lifecycle.js`.

- [ ] **Step 3: Typecheck the example**

Run: `pnpm typecheck:examples`
Expected: no errors — confirms `onActivate`/`onSuspend` exist on `Scene` (Slice 2) and `init()` is now a valid synchronous override.

- [ ] **Step 4: Update the matching guide prose in `scenes-and-lifecycle.mdx`**

In `site/src/content/guide/runtime/scenes-and-lifecycle.mdx`, the "The lifecycle hooks, in order" section currently reads (lines 135–155):

```md
The first time a scene starts:

1. `async load(loader)` — declare assets you need. Resolves before `init`.
2. `init(loader)` — build state. Loaded assets are available via `loader.get(...)`.

Then, every frame while the scene is active:

3. `fixedUpdate(delta)` — zero or more deterministic steps with a constant `delta`, run before `update`.
4. `update(delta)` — advance state. `delta.seconds` is the elapsed time since the last frame.
5. `draw(context)` — render the current state.

When the scene is replaced or the application shuts down:

6. `async unload(loader)` — release scene-private assets that aren't needed by the next scene.
7. `destroy()` — drop scene-graph references and cancel input bindings.
```

Change to:

```md
The first time a scene starts:

1. `async load()` — declare assets you need via `this.loader`. Resolves before `init`.
2. `init(data)` — build state. Must be synchronous. Loaded assets are available via `this.loader.get(...)`; activation data (if the scene declares a data type) arrives here.

Then, every frame while the scene is active:

3. `fixedUpdate(delta)` — zero or more deterministic steps with a constant `delta`, run before `update`.
4. `update(delta)` — advance state. `delta.seconds` is the elapsed time since the last frame.
5. `draw(context)` — render the current state.

Two signals bracket activation from the outside rather than being hooks you override: `Scene.onActivate` fires every time the scene becomes `Active` (fresh start, a consumed preload, or a restore from retention); `Scene.onSuspend` fires when the scene is suspended for retention instead of ended permanently.

When the scene is replaced or the application shuts down:

6. `async unload()` — release scene-private assets that aren't needed by the next scene.
7. `destroy()` — drop scene-graph references and cancel input bindings.
```

This file's other stale mentions of `setScene`/`init(loader)`/`load(loader)` are handled by Task 5 — this step only touches the hooks-in-order list and the code samples directly quoting `init(loader)`/`load(loader)` signatures, since those two are what this task's own example rewrite changes.

- [ ] **Step 5: Typecheck the guide**

Run: `pnpm typecheck:guides`
Expected: no errors for `scenes-and-lifecycle.mdx` (this step only fixed prose text, not a fenced code block that gets typechecked — confirm by re-reading the diff: the changed lines are outside any ` ```js ` fence).

- [ ] **Step 6: Commit**

```bash
git add examples/application-scenes/scene-lifecycle.ts examples/application-scenes/scene-lifecycle.js site/src/content/guide/runtime/scenes-and-lifecycle.mdx
git commit -m "fix(examples): replace removed Scene.onLoad/onUnload with onActivate/onSuspend, fix illegal async init() (scene-transition slice 8)"
```

---

### Task 5: Guide sweep — `runtime/scenes-and-lifecycle.mdx` (switching-scenes section)

**Files:**

- Modify: `site/src/content/guide/runtime/scenes-and-lifecycle.mdx`

**Context:** Task 4 already fixed this file's lifecycle-hooks-in-order section. This task fixes the remaining stale material: the "Switching scenes" section (instance-based `setScene` calls, predates even the already-shipped constructor-based navigation), the `init(loader)`/`load(loader)` code samples in the "load"/"init" sections, and the "unload and destroy" section's `setScene` mention and `unload(loader)` signature.

- [ ] **Step 1: Fix "Running a scene"**

Line 47–50 currently:

````md
```js
const app = new Application();
app.start(new TitleScene());
```
````

````

Change to:

```md
```js
const app = new Application({ scenes: { TitleScene } });
app.start(TitleScene);
````

````

- [ ] **Step 2: Fix "Switching scenes"**

Lines 56–68 currently:

```md
Most non-trivial projects have more than one scene. The application owns a scene manager (`app.scenes`) that drives the active scene. Use `setScene` to swap in a new scene:

```js
// Replace the active scene with a new one
await app.scenes.setScene(new GameScene());

// Replace with a fade transition
await app.scenes.setScene(new GameScene(), { transition: { type: 'fade' } });
````

`setScene` ends the current scene — running `unload` and `destroy` — and starts the new one. The optional `transition` argument adds a brief cross-fade so the cut is not jarring.

For a typical app: a `MenuScene` calls `setScene(new GameScene())` when the player clicks Start. `app.scenes.currentScene` always reflects the currently active scene.

````

Change to:

```md
Most non-trivial projects have more than one scene. The application owns a scene director (`app.scenes`) that drives the active scene. Use `change` to swap in a new scene, and register scene constructors up front so `change` knows which classes are valid targets:

```js
const app = new Application({ scenes: { GameScene } });

// Replace the active scene with a fresh instance
await app.scenes.change(GameScene);

// Replace with a fade transition
await app.scenes.change(GameScene, { transition: new FadeSceneTransition() });
````

`change` ends the current scene — running `unload` and `destroy` — and starts a fresh instance of the target. The optional `transition` option (a `SceneTransition` instance, e.g. `FadeSceneTransition`) adds a brief cross-fade so the cut is not jarring.

For a typical app: a `MenuScene` calls `this.app.scenes.change(GameScene)` when the player clicks Start. `app.scenes.currentScene` always reflects the currently active scene.

````

- [ ] **Step 3: Fix the `init(loader)` code sample**

Lines 180–187 currently:

```md
The `init` hook is where you create the scene's actual objects. The same `loader` instance is passed in; calling `loader.get(...)` returns the already-loaded asset:

```js
init(loader) {
    this.hero = new Sprite(loader.get('image/hero.png'));
    this.hero.setAnchor(0.5);
    this.hero.setPosition(400, 300);
    this.addChild(this.hero);
}
````

````

Change to:

```md
The `init` hook is where you create the scene's actual objects. Read a previously-loaded asset via `this.loader`:

```js
init() {
    this.hero = new Sprite(this.loader.get('image/hero.png'));
    this.hero.setAnchor(0.5);
    this.hero.setPosition(400, 300);
    this.addChild(this.hero);
}
````

````

- [ ] **Step 4: Fix the `load(loader)` code sample**

Lines 161–171 currently:

```md
```js
import { Scene } from '@codexo/exojs';

class GameScene extends Scene {
    async load(loader) {
        await Promise.all([
            loader.load('image/hero.png'),
            loader.load('image/ground.png'),
        ]);
    }
}
````

````

Change to:

```md
```js
import { Scene } from '@codexo/exojs';

class GameScene extends Scene {
    async load() {
        await Promise.all([
            this.loader.load('image/hero.png'),
            this.loader.load('image/ground.png'),
        ]);
    }
}
````

````

- [ ] **Step 5: Fix "unload and destroy"**

Line 304 currently:

```md
The `unload` hook runs when the scene is replaced by `setScene` or when the application shuts down. Use it to release assets the scene was holding that no other scene needs.
````

Change to:

```md
The `unload` hook runs when the scene ends permanently — replaced by `change`/`restore`, discarded via `unload(Target)`, or the application shuts down (not when the scene is only suspended for retention). Use it to release assets the scene was holding that no other scene needs.
```

- [ ] **Step 6: Fix the two Examples-section prose mentions**

Line 316 currently: `Switching between two scenes — a menu and a game — using \`app.scenes.setScene\`.`Change`app.scenes.setScene`to`app.scenes.change`.

Line 328 currently: `` `app.scenes.pause()`/`resume()` gate `update`; `draw` keeps running. `` — unaffected by this spec, leave as-is (pause/resume are a different, orthogonal feature this spec does not touch).

- [ ] **Step 7: Typecheck the guide**

Run: `pnpm typecheck:guides`
Expected: no errors — the changed fenced blocks (`init()`, `load()`) still compile under `tsconfig.guides.json`'s no-check conventions for illustrative snippets; the `Application`/`FadeSceneTransition` construction blocks are real, checked code and must resolve against the real `@codexo/exojs` types.

- [ ] **Step 8: Commit**

```bash
git add site/src/content/guide/runtime/scenes-and-lifecycle.mdx
git commit -m "docs(guide): migrate scenes-and-lifecycle to change()/FadeSceneTransition (scene-transition slice 8)"
```

---

### Task 6: Guide sweep — `runtime/application.mdx`

**Files:**

- Modify: `site/src/content/guide/runtime/application.mdx`

- [ ] **Step 1: Fix the "Subsystems on the application" bullet**

Line 160 currently:

```md
- `app.scenes` — the [`SceneDirector`](/ExoJS/en/api/scene-director/) that holds the single active scene; switch scenes via `setScene` (with optional fade).
```

Change to:

```md
- `app.scenes` — the [`SceneDirector`](/ExoJS/en/api/scene-director/) that holds the single active scene; switch scenes via `change` (with an optional transition).
```

- [ ] **Step 2: Typecheck the guide**

Run: `pnpm typecheck:guides`
Expected: no errors (this is a prose-only bullet, not inside any fenced code block).

- [ ] **Step 3: Commit**

```bash
git add site/src/content/guide/runtime/application.mdx
git commit -m "docs(guide): fix stale setScene mention in application.mdx (scene-transition slice 8)"
```

---

### Task 7: Guide sweep — `recipes/pause-menu.mdx` and `recipes/cinematics.mdx`

**Files:**

- Modify: `site/src/content/guide/recipes/pause-menu.mdx`
- Modify: `site/src/content/guide/recipes/cinematics.mdx`

**Context:** Both files' `pause()`/`resume()` material is untouched by this spec (a different, already-shipped feature) — only the `setScene`/transition-config-object material changes.

- [ ] **Step 1: Fix `pause-menu.mdx`'s "Clear filters in destroy" callout**

Line 89 currently:

```md
Any filter you set in `init` or `togglePause` — the `BlurFilter` here — must be cleared in `destroy`. Otherwise it stays attached to `scene.root` and bleeds into the next scene after `app.scenes.setScene(...)`.
```

Change `app.scenes.setScene(...)` to `app.scenes.change(...)`.

- [ ] **Step 2: Fix `pause-menu.mdx`'s "Cleanup" section**

Line 109 currently:

```md
The `destroy` hook clears the blur filter from `scene.root`. Without this, the filter array would linger if the scene is ever replaced via `app.scenes.setScene(...)`. As a rule, any filter applied in `init` or `togglePause` should be cleaned up in `destroy`.
```

Change `app.scenes.setScene(...)` to `app.scenes.change(...)`.

- [ ] **Step 3: Fix `pause-menu.mdx`'s "Switching scenes from the pause menu" section**

Lines 111–125 currently:

````md
If the pause menu offers options like "Return to main menu" or "Quit", use `app.scenes.setScene(...)` to navigate away — it unloads the current scene and loads the next one, optionally with a fade transition:

```js
// Inside a resume button's onClick handler:
resumeButton.onClick.add(() => {
  this.togglePause(); // unpause first
});

// Inside a "main menu" button's onClick handler:
mainMenuButton.onClick.add(() => {
  this.app.scenes.setScene(MainMenuScene, { transition: { type: 'fade' } });
});
```
````

````

Change to:

```md
If the pause menu offers options like "Return to main menu" or "Quit", use `app.scenes.change(...)` to navigate away — it unloads the current scene and loads the next one, optionally with a fade transition:

```js
// Inside a resume button's onClick handler:
resumeButton.onClick.add(() => {
    this.togglePause(); // unpause first
});

// Inside a "main menu" button's onClick handler:
mainMenuButton.onClick.add(() => {
    this.app.scenes.change(MainMenuScene, { transition: new FadeSceneTransition() });
});
````

````

- [ ] **Step 4: Typecheck `pause-menu.mdx`**

Run: `pnpm typecheck:guides`
Expected: no errors.

- [ ] **Step 5: Commit `pause-menu.mdx`**

```bash
git add site/src/content/guide/recipes/pause-menu.mdx
git commit -m "docs(guide): migrate pause-menu recipe to change()/FadeSceneTransition (scene-transition slice 8)"
````

- [ ] **Step 6: Fix `cinematics.mdx`'s intro paragraph and "Approach" section**

Line 11 currently: ``...and `app.scenes.setScene(...)` for transitioning between game states.`` — change `app.scenes.setScene(...)` to `app.scenes.change(...)`.

Line 15 currently:

```md
A cinematic is a scene. It owns the sequence. Tweens drive every timed element — camera pans, title reveals, character entrances, music fades. Navigate to the cinematic scene via `app.scenes.setScene(CinematicScene)` to fully replace the game scene while the cutscene plays, and call `app.scenes.setScene(...)` again when the sequence ends to return to gameplay.
```

Change to:

```md
A cinematic is a scene. It owns the sequence. Tweens drive every timed element — camera pans, title reveals, character entrances, music fades. Navigate to the cinematic scene via `app.scenes.change(CinematicScene)` to fully replace the game scene while the cutscene plays, and call `app.scenes.change(...)` again when the sequence ends to return to gameplay.
```

- [ ] **Step 7: Fix the "Gating input" section**

Lines 114–117 currently:

````md
```js no-check
// From the game scene — switch to the cinematic:
this.app.scenes.setScene(CinematicScene);
```
````

````

Change `this.app.scenes.setScene(CinematicScene);` to `this.app.scenes.change(CinematicScene);`.

Lines 121–130 currently:

```md
```js no-check
// At the end of the sequence — chain a tween to transition back to the game:
this.app.tweens.create(this.barSize)
    .to({ v: 70 }, 0.6)
    .delay(3.5) // start closing bars after the sequence plays
    .onComplete(() => {
        this.app.scenes.setScene(GameScene, { transition: { type: 'fade' } });
    })
    .start();
````

````

Change the inner call to `this.app.scenes.change(GameScene, { transition: new FadeSceneTransition() });`.

Line 132 currently: `` The closing shutter bars animate over the scene, then `setScene(...)` transitions back to the game with a fade. `` — change `` `setScene(...)` `` to `` `change(...)` ``.

- [ ] **Step 8: Fix the "Skip support" section**

Lines 166–178 currently:

```md
```js no-check
init() {
    // ... cinematic setup ...

    this.inputs.onTrigger(Keyboard.Space, () => {
        this.app.scenes.setScene(GameScene);
    });

    const pad = this.app.input.getGamepad(0);
    pad.onTrigger(GamepadButton.Start, () => {
        this.app.scenes.setScene(GameScene);
    });
}
````

````

Change both `this.app.scenes.setScene(GameScene);` occurrences to `this.app.scenes.change(GameScene);`.

Lines 183–192 currently:

```md
```js no-check
this.inputs.onTrigger(Keyboard.Space, () => {
    // Jump all tweens to their end state
    this.app.tweens.clear(); // stops all active tweens
    this.musicVoice.volume = 0.85;
    this.boss.setScale(2.1, 2.1);
    // ... snap other properties ...
    this.app.scenes.setScene(GameScene);
});
````

````

Change `this.app.scenes.setScene(GameScene);` to `this.app.scenes.change(GameScene);`.

- [ ] **Step 9: Typecheck `cinematics.mdx`**

Run: `pnpm typecheck:guides`
Expected: no errors for the main (non-`no-check`) fenced block; the `no-check` blocks are illustrative and not typechecked, but must still read correctly as prose-adjacent code.

- [ ] **Step 10: Commit `cinematics.mdx`**

```bash
git add site/src/content/guide/recipes/cinematics.mdx
git commit -m "docs(guide): migrate cinematics recipe to change()/FadeSceneTransition (scene-transition slice 8)"
````

---

### Task 8: `packages/exojs-react` — `Scenes.tsx`, `useScene.ts`, and their tests

**Files:**

- Modify: `packages/exojs-react/src/Scenes.tsx`
- Modify: `packages/exojs-react/src/useScene.ts`
- Modify: `packages/exojs-react/test/Scenes.test.tsx`
- Modify: `packages/exojs-react/test/useScene.test.tsx`
- Modify: `packages/exojs-react/test/support/mock-application.ts`

**Interfaces:**

- Consumes: `SceneDirector.change<C>(target: C, options?: ChangeSceneOptions<InferSceneData<C>>): Promise<this>` (Slice 3); `SceneTransitionSelection` (Slice 6, the union type covering `SceneTransition | SceneTransitionPhases | false`, used for the `transition` option since a React-side `<Scenes transition={...}>` should accept the same range of values `change()` itself accepts); `FadeSceneTransition` (Slice 7).

- [ ] **Step 1: Rewrite `mock-application.ts`'s `MockSceneDirector`**

In `packages/exojs-react/test/support/mock-application.ts`, change the interface:

```ts
interface MockSceneDirector {
  currentScene: unknown;
  setScene: ReturnType<typeof vi.fn>;
}
```

to:

```ts
interface MockSceneDirector {
  currentScene: unknown;
  change: ReturnType<typeof vi.fn>;
}
```

Change the `scenes` field's implementation (the comment above `setScene` mentions the real method by its old name too):

```ts
  public readonly scenes: MockSceneDirector = {
    currentScene: null,
    // The real SceneDirector.setScene() takes a constructor and constructs a
    // fresh instance internally (definition §11.4) — mirror that here so
    // `scenes.currentScene` is an instance, matching what the real API
    // exposes, while `setScene.mock.calls` still records the raw constructor
    // argument tests assert against.
    setScene: vi.fn(async (SceneClass: new () => unknown): Promise<MockSceneDirector> => {
      this.scenes.currentScene = new SceneClass();
      return this.scenes;
    }),
  };
```

to:

```ts
  public readonly scenes: MockSceneDirector = {
    currentScene: null,
    // The real SceneDirector.change() takes a constructor and constructs a
    // fresh instance internally (definition §11.4) — mirror that here so
    // `scenes.currentScene` is an instance, matching what the real API
    // exposes, while `change.mock.calls` still records the raw constructor
    // argument tests assert against.
    change: vi.fn(async (SceneClass: new () => unknown): Promise<MockSceneDirector> => {
      this.scenes.currentScene = new SceneClass();
      return this.scenes;
    }),
  };
```

Also fix the class-level JSDoc mentioning `start / setScene`:

```ts
 * it only records the calls the React glue makes (construction, resize,
 * sizingMode / clearColor assignment, start / setScene, destroy) so the tests
```

to:

```ts
 * it only records the calls the React glue makes (construction, resize,
 * sizingMode / clearColor assignment, start / change, destroy) so the tests
```

- [ ] **Step 2: Rewrite `Scenes.tsx`**

Change the `ScenesProps.transition` field type. Currently:

```ts
import { ApplicationStatus, type Scene as ExoScene, type SceneTransition } from '@codexo/exojs';
```

```ts
/** Props for the {@link Scenes} switch. */
export interface ScenesProps {
  /** Name of the active {@link Scene}. Changing it switches scenes. */
  readonly active: string;
  /** Optional transition (e.g. a fade) applied when switching scenes. */
  readonly transition?: SceneTransition;
  /** {@link Scene} declarations. */
  readonly children?: ReactNode;
}
```

Change to:

```ts
import { ApplicationStatus, type Scene as ExoScene, type SceneTransitionSelection } from '@codexo/exojs';
```

```ts
/** Props for the {@link Scenes} switch. */
export interface ScenesProps {
  /** Name of the active {@link Scene}. Changing it switches scenes. */
  readonly active: string;
  /** Optional transition (e.g. a `FadeSceneTransition`) applied when switching scenes. */
  readonly transition?: SceneTransitionSelection;
  /** {@link Scene} declarations. */
  readonly children?: ReactNode;
}
```

Update the class JSDoc and `@example` (currently references `app.scenes.setScene()` and the old `{ type: 'fade' }` config object):

````ts
 * via `app.start()` (first activation) or `app.scenes.setScene()` (subsequent
 * switches, with the optional `transition`) — the declaration's `component`
 * constructor must be registered in `ApplicationOptions.scenes`. The active
 * scene's React children (HUD overlay) render alongside, and can read the
 * instance via {@link useActiveScene}.
 *
 * A failure in `app.start()`/`app.scenes.setScene()` (e.g. a scene's `onLoad`
 * rejects) is caught and routed to {@link Application.onError} rather than
 * left as an unhandled promise rejection — subscribe via `app.onError.add(...)`
 * or the {@link import('./ExoCanvas').ExoCanvas} `onError` prop to observe it.
 *
 * @example
 * ```tsx
 * <ExoCanvas>
 *   <Scenes active={screen} transition={{ type: 'fade', duration: 0.3 }}>
 *     <Scene name="title" component={TitleScene} />
 *     <Scene name="game" component={GameScene}>
 *       <Hud />
 *     </Scene>
 *   </Scenes>
 * </ExoCanvas>
 * ```
 */
````

to:

````ts
 * via `app.start()` (first activation) or `app.scenes.change()` (subsequent
 * switches, with the optional `transition`) — the declaration's `component`
 * constructor must be registered in `ApplicationOptions.scenes`. The active
 * scene's React children (HUD overlay) render alongside, and can read the
 * instance via {@link useActiveScene}.
 *
 * A failure in `app.start()`/`app.scenes.change()` (e.g. a scene's `load()`
 * rejects) is caught and routed to {@link Application.onError} rather than
 * left as an unhandled promise rejection — subscribe via `app.onError.add(...)`
 * or the {@link import('./ExoCanvas').ExoCanvas} `onError` prop to observe it.
 *
 * @example
 * ```tsx
 * import { FadeSceneTransition } from '@codexo/exojs';
 *
 * <ExoCanvas>
 *   <Scenes active={screen} transition={new FadeSceneTransition({ duration: 300 })}>
 *     <Scene name="title" component={TitleScene} />
 *     <Scene name="game" component={GameScene}>
 *       <Hud />
 *     </Scene>
 *   </Scenes>
 * </ExoCanvas>
 * ```
 */
````

Update the `apply()` body and its catch-block comment:

```ts
        if (app.status === ApplicationStatus.Stopped) {
          // First activation initializes the backend and starts the frame loop;
          // transitions only apply to subsequent switches.
          await app.start(SceneClass);
        } else {
          await app.scenes.setScene(SceneClass, transition !== undefined ? { transition } : {});
        }
        if (!cancelled) {
          setInstance(app.scenes.currentScene);
        }
      } catch (error) {
        // Route to Application.onError instead of leaving an unhandled
        // rejection — app.start()/setScene() reject rather than dispatching
        // onError themselves.
        app.onError.dispatch(error instanceof Error ? error : new Error(String(error)));
      }
```

to:

```ts
        if (app.status === ApplicationStatus.Stopped) {
          // First activation initializes the backend and starts the frame loop;
          // transitions only apply to subsequent switches.
          await app.start(SceneClass);
        } else {
          await app.scenes.change(SceneClass, transition !== undefined ? { transition } : {});
        }
        if (!cancelled) {
          setInstance(app.scenes.currentScene);
        }
      } catch (error) {
        // Route to Application.onError instead of leaving an unhandled
        // rejection — app.start()/change() reject rather than dispatching
        // onError themselves.
        app.onError.dispatch(error instanceof Error ? error : new Error(String(error)));
      }
```

- [ ] **Step 3: Rewrite `useScene.ts`**

Update the class JSDoc:

```ts
 * On first call (engine not yet started) this hook calls `app.start(SceneClass)`,
 * which initializes the render backend and begins the per-frame loop. On
 * subsequent dep-change remounts it calls `app.scenes.setScene(SceneClass)` to
 * switch scenes without restarting the engine. Each activation constructs a
 * fresh instance (definition §11.4) — this hook never reuses one across calls.
 *
 * A failure in `app.start()`/`app.scenes.setScene()` (e.g. a scene's `onLoad`
 * rejects) is caught and routed to {@link Application.onError} rather than
 * left as an unhandled promise rejection — subscribe via
 * `app.onError.add(...)` or the {@link import('./ExoCanvas').ExoCanvas}
 * `onError` prop to observe it.
```

to:

```ts
 * On first call (engine not yet started) this hook calls `app.start(SceneClass)`,
 * which initializes the render backend and begins the per-frame loop. On
 * subsequent dep-change remounts it calls `app.scenes.change(SceneClass)` to
 * switch scenes without restarting the engine. Each activation constructs a
 * fresh instance (definition §11.4) — this hook never reuses one across calls.
 *
 * A failure in `app.start()`/`app.scenes.change()` (e.g. a scene's `load()`
 * rejects) is caught and routed to {@link Application.onError} rather than
 * left as an unhandled promise rejection — subscribe via
 * `app.onError.add(...)` or the {@link import('./ExoCanvas').ExoCanvas}
 * `onError` prop to observe it.
```

Update the body:

```ts
        if (app.status === ApplicationStatus.Stopped) {
          // First activation — initialize the backend and start the frame loop.
          await app.start(target);
        } else {
          // Engine already running — switch scenes without restarting.
          await app.scenes.setScene(target);
        }

        if (!cancelled) {
          setScene(app.scenes.currentScene as T);
        }
      } catch (error) {
        // Route to Application.onError instead of leaving an unhandled
        // rejection — app.start()/setScene() reject rather than dispatching
        // onError themselves.
        app.onError.dispatch(error instanceof Error ? error : new Error(String(error)));
      }
```

to:

```ts
        if (app.status === ApplicationStatus.Stopped) {
          // First activation — initialize the backend and start the frame loop.
          await app.start(target);
        } else {
          // Engine already running — switch scenes without restarting.
          await app.scenes.change(target);
        }

        if (!cancelled) {
          setScene(app.scenes.currentScene as T);
        }
      } catch (error) {
        // Route to Application.onError instead of leaving an unhandled
        // rejection — app.start()/change() reject rather than dispatching
        // onError themselves.
        app.onError.dispatch(error instanceof Error ? error : new Error(String(error)));
      }
```

And the cleanup-comment reference: `// each frame; it must be a no-op rather than calling setScene on an unmounted tree.` — no such comment actually exists in `useScene.ts` itself (only in its test file, handled in Step 5) — skip if not present after re-reading the file; the two remaining `setScene` textual references inside `useScene.ts` are exactly the two already replaced above (grep the file after this step to confirm zero remaining `setScene` occurrences).

- [ ] **Step 4: Run `packages/exojs-react`'s typecheck to catch anything the mechanical renames missed**

Run: `pnpm --filter @codexo/exojs-react typecheck`
Expected: fails at this point — `Scenes.test.tsx`/`useScene.test.tsx` still reference `app.scenes.setScene` against a mock whose field is now named `change` (Step 1 already renamed the mock). This is expected; Steps 5–6 fix the tests next.

- [ ] **Step 5: Rewrite `Scenes.test.tsx`**

Update the import and the transition-carrying test. Change:

```ts
import { Application, Scene as ExoScene, type SceneTransition } from '@codexo/exojs';
```

to:

```ts
import { Application, FadeSceneTransition, Scene as ExoScene, type SceneTransitionSelection } from '@codexo/exojs';
```

Change the `Tree` helper's prop type:

```ts
function Tree({ app, active, transition }: { app: Application; active: string; transition?: SceneTransition }): ReactElement {
```

to:

```ts
function Tree({ app, active, transition }: { app: Application; active: string; transition?: SceneTransitionSelection }): ReactElement {
```

Replace every `app.scenes.setScene` occurrence with `app.scenes.change` (nine occurrences across the file: the `not.toHaveBeenCalled()` assertions, the `.mock.calls` reads, and the `mockRejectedValueOnce` calls). Update the test titled `'switches scenes via app.scenes.setScene() (engine running) and forwards the transition'` to `'switches scenes via app.scenes.change() (engine running) and forwards the transition'`, and its body:

```ts
    const transition: SceneTransition = { type: 'fade', duration: 300 };
    view.rerender(<Tree app={app} active="game" transition={transition} />);

    await waitFor(() => expect(app.scenes.setScene).toHaveBeenCalled());
    const lastCall = app.scenes.setScene.mock.calls.at(-1)!;
```

to:

```ts
    const transition = new FadeSceneTransition({ duration: 300 });
    view.rerender(<Tree app={app} active="game" transition={transition} />);

    await waitFor(() => expect(app.scenes.change).toHaveBeenCalled());
    const lastCall = app.scenes.change.mock.calls.at(-1)!;
```

Rename the two test titles containing `app.scenes.setScene()` (`'routes a rejected app.scenes.setScene() (scene switch) to app.onError'` and `'wraps a non-Error rejection from app.scenes.setScene() (scene switch) before dispatching it'`) to say `app.scenes.change()` instead, and their bodies' `app.scenes.setScene.mockRejectedValueOnce(...)` to `app.scenes.change.mockRejectedValueOnce(...)`. Also rename the local variable `setSceneCallsBefore` (in the "clears the local HUD overlay" test) to `changeCallsBefore`, updating both its declaration (`app.scenes.setScene.mock.calls.length`) and its later assertion (`app.scenes.setScene.mock.calls.length`) to read `app.scenes.change.mock.calls.length`.

- [ ] **Step 6: Rewrite `useScene.test.tsx`**

Replace every `app.scenes.setScene` occurrence with `app.scenes.change` (six occurrences: two `not.toHaveBeenCalled()`/`toHaveBeenCalled()` assertions, one `.mock.calls.some(...)` read, one `mockRejectedValueOnce`, and two inline comments). Rename the test titled `'switches scenes via setScene (not a restart) when deps change'` to `'switches scenes via change (not a restart) when deps change'`, and `'does not call setScene when the component unmounts...'` to `'does not call change when the component unmounts...'`, and `'routes a rejected app.scenes.setScene() (dep-change switch) to app.onError'` to `'routes a rejected app.scenes.change() (dep-change switch) to app.onError'`. Update the inline comment `// The new scene is installed through setScene; the engine is NOT started again.` to `// The new scene is installed through change(); the engine is NOT started again.`, and `// it must be a no-op rather than calling setScene on an unmounted tree.` to `// it must be a no-op rather than calling change on an unmounted tree.`.

- [ ] **Step 7: Run the package's tests**

Run: `pnpm --filter @codexo/exojs-react test`
Expected: PASS, all Scenes/useScene tests green.

- [ ] **Step 8: Run the package's typecheck**

Run: `pnpm --filter @codexo/exojs-react typecheck`
Expected: no errors.

- [ ] **Step 9: Lint the package**

Run: `pnpm lint:packages`
Expected: no errors.

- [ ] **Step 10: Commit**

```bash
git add packages/exojs-react/src/Scenes.tsx packages/exojs-react/src/useScene.ts packages/exojs-react/test/Scenes.test.tsx packages/exojs-react/test/useScene.test.tsx packages/exojs-react/test/support/mock-application.ts
git commit -m "fix(exojs-react): migrate to change()/FadeSceneTransition navigation API (scene-transition slice 8)"
```

---

### Task 9: `packages/create-exo-app` game-starter template

**Files:**

- Modify: `packages/create-exo-app/templates/game-starter/src/scenes/GameScene.ts`
- Modify: `packages/create-exo-app/templates/game-starter/src/scenes/GameOverScene.ts`

- [ ] **Step 1: Rewrite `GameScene.ts`'s navigation call**

Line 43 currently:

```ts
void this.app!.scenes.setScene(GameOverScene, { score: Math.floor(this._elapsed) });
```

Change to:

```ts
void this.app!.scenes.change(GameOverScene, { data: { score: Math.floor(this._elapsed) } });
```

- [ ] **Step 2: Rewrite `GameOverScene.ts`'s navigation call**

Line 25 currently:

```ts
void this.app!.scenes.setScene(GameScene);
```

Change to:

```ts
void this.app!.scenes.change(GameScene);
```

- [ ] **Step 3: Typecheck the template**

The `game-starter` template is a standalone project scaffold, not part of the root TS project; verify it compiles as its own project:

Run: `pnpm --filter create-exo-app verify:create-exo-app` if such a script exists on that package, otherwise run the root-level check: `pnpm verify:create-exo-app`
Expected: no errors. (`verify:create-exo-app` — `scripts/verify-create-exo-app.ts` — scaffolds the template into a temp directory and runs its own build/typecheck; this is the only gate that actually compiles template sources, since they're excluded from the root `tsconfig`.)

- [ ] **Step 4: Commit**

```bash
git add packages/create-exo-app/templates/game-starter/src/scenes/GameScene.ts packages/create-exo-app/templates/game-starter/src/scenes/GameOverScene.ts
git commit -m "fix(create-exo-app): migrate game-starter template to change() navigation (scene-transition slice 8)"
```

---

### Task 10: Guide sweep — `recipes/build-orb-dodge.mdx` and `integrations/react.mdx`

**Files:**

- Modify: `site/src/content/guide/recipes/build-orb-dodge.mdx`
- Modify: `site/src/content/guide/integrations/react.mdx`

**Context:** `build-orb-dodge.mdx` narrates `examples/showcase/orb-dodge.ts` (already fixed in Task 3) via `<SourceSnippet>` — its own text is prose describing that file's `setScene` calls by name, not fenced runnable code, so only the prose needs the rename.

- [ ] **Step 1: Fix `build-orb-dodge.mdx`'s three prose mentions**

Line 163 currently: ``Orbs that leave the canvas are also removed. After the loop, if `gameEnded` is true, call `setScene` to switch to the game-over screen.`` — change `` `setScene` `` to `` `change` ``.

Line 187 currently: `` `GameOverScene` declares its activation-data shape (`GameOverData`) and receives the final score and time as the second argument to `setScene` — `init(data)` reads `data.score` / `data.time` directly... `` — change to: ``...and receives the final score and time via `change`'s `data` option — `init(data)` reads `data.score` / `data.time` directly...``

Line 196 currently: ``When the player restarts, `setScene(PlayScene)` switches back.`` — change to: ``When the player restarts, `change(PlayScene)` switches back.``

Line 211 currently:

```md
`PlayScene` calls `void this.app.scenes.setScene(GameOverScene, { score: this.score, time: this.elapsed })`. `GameOverScene` calls `void this.app.scenes.setScene(PlayScene)`. Each call constructs a brand-new instance of the target scene — there's no shared mutable state between activations, and no forward-reference ordering to worry about, since both classes are declared once and referenced by name.
```

Change to:

```md
`PlayScene` calls `void this.app.scenes.change(GameOverScene, { data: { score: this.score, time: this.elapsed } })`. `GameOverScene` calls `void this.app.scenes.change(PlayScene)`. Each call constructs a brand-new instance of the target scene — there's no shared mutable state between activations, and no forward-reference ordering to worry about, since both classes are declared once and referenced by name.
```

- [ ] **Step 2: Typecheck `build-orb-dodge.mdx`**

Run: `pnpm typecheck:guides`
Expected: no errors (prose-only changes; the file's actual code comes from `<SourceSnippet>`, which pulls live from `examples/showcase/orb-dodge.ts`, already fixed and typechecked in Task 3).

- [ ] **Step 3: Commit `build-orb-dodge.mdx`**

```bash
git add site/src/content/guide/recipes/build-orb-dodge.mdx
git commit -m "docs(guide): fix stale setScene prose in build-orb-dodge recipe (scene-transition slice 8)"
```

- [ ] **Step 4: Fix `react.mdx`'s "Scenes switch" prose**

Line 129 currently:

```md
`app.scenes.setScene(scene, …)` with the optional `transition`.
```

Change to:

```md
`app.scenes.change(scene, …)` with the optional `transition`.
```

Line 160–161 currently:

```md
`children` that render as the active scene's overlay. The `transition` (a core `SceneTransition`,
e.g. a fade whose `duration` is in milliseconds) only applies to switches, not the first start.
```

Change to:

```md
`children` that render as the active scene's overlay. The `transition` (a `SceneTransition`
instance — e.g. `new FadeSceneTransition({ duration: 300 })`, `duration` in milliseconds) only
applies to switches, not the first start.
```

Line 256 currently:

```md
chapter explains `app.start`, `app.scenes.setScene`, transitions, and the hooks the React layer
```

Change `` `app.scenes.setScene` `` to `` `app.scenes.change` ``.

- [ ] **Step 5: Fix `react.mdx`'s two `<Scenes transition={{ type: 'fade', duration: 300 }}>` code samples**

Line 148:

```tsx
      <Scenes active={screen} transition={{ type: 'fade', duration: 300 }}>
```

Change to:

```tsx
      <Scenes active={screen} transition={new FadeSceneTransition({ duration: 300 })}>
```

Line 233 (the "End-to-end" example — same fix):

```tsx
      <Scenes active={screen} transition={{ type: 'fade', duration: 300 }}>
```

Change to:

```tsx
      <Scenes active={screen} transition={new FadeSceneTransition({ duration: 300 })}>
```

Both fenced blocks import from `@codexo/exojs` at their top — add `FadeSceneTransition` to each block's existing import line (read the exact current import statement in each of the two code fences before editing, since they may already import a different subset of names from `@codexo/exojs` for their own scene classes, and the new name must be added to that same line, not a duplicate `import` statement).

- [ ] **Step 6: Typecheck `react.mdx`**

Run: `pnpm typecheck:guides`
Expected: no errors, or confirm both fences are marked `no-check` in the source (re-check the fence's info string — `tsx` vs `tsx no-check` — before assuming either way; the "End-to-end" example was previously seen with `tsx no-check`, the first `<Game>` example's fence should be re-checked directly since its exact info string wasn't part of the earlier grep output).

- [ ] **Step 7: Commit `react.mdx`**

```bash
git add site/src/content/guide/integrations/react.mdx
git commit -m "docs(guide): migrate react integration guide to change()/FadeSceneTransition (scene-transition slice 8)"
```

---

### Task 11: Regenerate API docs

**Files:**

- Modify (generated): `site/src/content/api/*.json`

**Context:** Slices 1–7 changed the engine's public export surface substantially (`SceneDirector.change`/`.restore`/`.unload`/`.preload` replace `setScene`/`restoreScene`/`releaseScene`; `SceneTransition`/`PhasedSceneTransition`/`SceneTransitionSession`/`FadeSceneTransition`/`CrossFadeSceneTransition`/`SlideSceneTransition` replace the old fade-only machinery; `Scene.onActivate`/`onSuspend` replace `onLoad`/`onUnload`; new error classes `AmbiguousSceneInstanceError` alongside the retained ones). The generated JSON under `site/src/content/api/` still reflects the pre-redesign surface (confirmed by Task 1's audit finding `set-scene-args.json`, `set-scene-options.json`, `retained-scene-conflict-error.json`, etc.) and must be regenerated wholesale — this is a mechanical build-artifact refresh, not a hand-edit.

- [ ] **Step 1: Regenerate**

Run: `pnpm docs:api:generate`
Expected: exits 0.

- [ ] **Step 2: Inspect what changed**

Run: `git status --short site/src/content/api/`
Expected: a mix of modified files (existing symbols with changed shapes, e.g. `scene-director.json`), deleted files (symbols that no longer exist, e.g. `set-scene-args.json`, `set-scene-options.json`, `restore-scene-options.json` if those exact type names were removed rather than renamed — confirm against what Slice 1/3's actual exported type names ended up being), and new files (`change-scene-options.json` or equivalent, `scene-transition.json`, `phased-scene-transition.json`, `fade-scene-transition.json`, `cross-fade-scene-transition.json`, `slide-scene-transition.json`, `ambiguous-scene-instance-error.json`, etc. — the exact filenames are whatever the generator derives from the final exported names, do not guess them ahead of running the generator).

- [ ] **Step 3: Verify sync**

Run: `pnpm docs:api:check`
Expected: exits 0 (confirms the regenerated content matches the current source exports exactly — this is the same check the pre-push hook runs).

- [ ] **Step 4: Commit**

```bash
git add site/src/content/api/
git commit -m "docs(api): regenerate API docs for the scene-transition/lifecycle redesign (scene-transition slice 8)"
```

If Step 1 produces no changes at all (every prior slice already regenerated docs as part of its own commit, per this repo's established convention — see the precedent commit `docs(api): regenerate scene-director.json for onStateChange doc update`), skip this commit and note in the final task's summary that no regeneration was needed.

---

### Task 12: `CHANGELOG.md` — rewrite the `[0.17.0] - Unreleased` section

**Files:**

- Modify: `CHANGELOG.md`

**Context:** The existing `[0.17.0] - Unreleased` section (lines 7–123) documents a different, already-merged v0.17 initiative (multiphase `System`, typed scene registry, pause, retention) using this spec's _old_ names. This task rewrites it to describe the state after this redesign, keeping every bullet that describes behavior this spec doesn't touch (multiphase `System`, pause/`when`-policy, extension system bindings, `SceneInteraction`/`SceneAudio` facades, `PhysicsWorld.fixedUpdate`, scene-less applications) and updating or replacing every bullet this spec's renames/reworks affect.

- [ ] **Step 1: Re-check the current top of the file**

Run: `head -6 CHANGELOG.md`
Expected: confirms the file still opens with the `# Changelog` preamble (lines 1–5) and line 7 is still `## [0.17.0] - Unreleased`, and no other release has landed between this plan's writing and its execution (if a new topmost `## [0.17.1]`/`## [0.18.0]` entry now exists above the Unreleased section, insert this rewrite's boundaries accordingly — the Unreleased section is always the one directly below the preamble, whatever sits above it).

- [ ] **Step 2: Replace the entire `[0.17.0]` section**

Replace everything from line 7 (`## [0.17.0] - Unreleased`) through line 123 (the blank line before `## [0.15.2] - 2026-07-04`) with:

```markdown
## [0.17.0] - Unreleased

The scene-model release. `Application`'s frame loop, scene lifecycle, and
navigation are rebuilt around a normative multiphase `System` contract, a
typed scene registry with scene-key navigation, pause with a per-binding
availability policy, retention (suspend a scene instead of destroying it,
restore it later without re-running `load()`/`init()`), transparent preload,
and a class-based, composable `SceneTransition` system. This is a pre-1.0
release and includes intentional breaking changes; see **Changed** and
**Removed**.

### Added

- **Multiphase `System` contract.** A `System` implements any subset of
  `fixedUpdate`/`update`/`draw` (previously `update` + `destroy` were
  required); `app.systems`/`scene.systems` dispatch each phase in ascending
  `order`, ties broken by insertion order. Structural add/remove during a
  frame is buffered to the next frame boundary.
- **Typed, bidirectional scene registry and scene-key navigation.** `new
Application({ scenes: { game: GameScene } })` registers scene constructors
  under a string key; `app.start('game', data?)`/`app.scenes.change('game',
{ data? })` navigate by key (autocomplete, no cross-scene runtime imports)
  alongside constructor-based navigation, both first-class. A scene may
  register a target-bound default `transition` (`{ scene: GameScene,
transition: sharedFade }` or a per-phase `{ enter, exit }` pair). Data and
  options are inferred from the scene's own generic, rejecting a mismatched
  or missing payload at compile time. Unregistered or duplicate registrations
  raise named errors (`UnregisteredSceneError`, `DuplicateSceneRegistrationError`,
  `InvalidSceneRegistrationError`).
- **`Scene<Data, AppLike>` and `ApplicationOf<T>`.** A project-local `Scene`
  base class can expose a fully-typed `this.app` — including that
  application's own scene registry, so `this.app.scenes.change('key', ...)`
  is typed inside scene code — independent of the registry generic on
  `Scene` itself.
- **`app.scenes.pause()`/`resume()`** freeze/unfreeze the active scene
  without changing its `SceneState` (which stays `Active`) — instead they
  toggle an orthogonal `paused` flag, read via `app.scenes.paused`/`scene.paused`.
  `update()`/systems stop while paused; `draw()`, interaction, and scene input
  keep running. `onPause`/`onResume` fire on both `SceneDirector` and the
  `Scene` itself; `onStateChange` does not fire for pause/resume (the state
  hasn't changed). Scene input bindings accept `when:
'active'|'paused'|'always'` (default `'active'`), with edge rules so a
  press/release pair must both occur in an allowed state to trigger.
  `this.interaction.capture(root)` confines pointer hit-testing to a subtree
  for modal UI.
- **`when: 'active' | 'paused' | 'always'` on `scene.tweens`/`scene.audio`.**
  `scene.tweens.create()`/`.add()`/`.createSequencer()` and `scene.audio.play()`/
  `.add()` accept a `when` option (default `'always'`, unchanged behavior)
  mirroring `SceneInputs`' existing policy — opt a specific tween, sequencer,
  or voice into freezing (`'active'`) or exclusively running (`'paused'`)
  across `app.scenes.pause()`/`resume()`. `SceneTweens.createSequencer()` is
  new — sequencers are now tracked for scene-lifetime teardown and retention
  suspend/restore, closing a previous gap where a sequencer obtained via
  `app.tweens.createSequencer()` was never tracked at all.
- **Scene retention.** `change(X, { suspendCurrent: true })` suspends the
  outgoing scene instead of destroying it; `app.scenes.restore(X)`
  reactivates the same instance without re-running `load()`/`init()`,
  returning to `Active` with whichever `paused` flag it had before
  suspension. Concurrent navigation calls are rejected with
  `ConcurrentSceneNavigationError` instead of racing silently.
- **Preload.** `app.scenes.preload(Target, data?)` prepares a scene ahead of
  time — `load()`/`init()` run and the scope reaches a genuine, cold `Ready`
  state (no update/draw/input dispatch, no application-wide side effects)
  without ever becoming visible. A later `change(Target, { data })` with
  matching data consumes the preload transparently, skipping the wait
  entirely; mismatched or absent data falls back to a fresh `prepare()`.
- **`unload(Target, { instance? })` — unified scene discard.** Replaces
  `releaseScene()`. Checks every candidate (active, retained, preloaded) for
  `Target`; resolves directly if exactly one exists, otherwise requires
  `instance: 'active' | 'retained' | 'preloaded' | 'all'` to disambiguate —
  rejecting with `AmbiguousSceneInstanceError` rather than silently picking
  one via a fixed priority order.
- **`SceneTransition` system.** A class-based, composable transition
  contract replaces the old hardcoded fade-only machinery: an immutable
  `SceneTransition` definition (reusable across navigations) produces a
  fresh `SceneTransitionSession` per navigation; `getRequirements()`
  declares the render resources a transition actually needs
  (`outgoingFrame`/`currentFrame`); an exact commit/rollback boundary and
  render-surface boundary make custom transitions safe to author. When no
  transition is configured, navigation runs a direct fast path with none of
  this machinery involved — there is no `InstantSceneTransition` type.
- **`PhasedSceneTransition`.** A simplified single-class `enter()`/`exit()`
  authoring layer over the full `SceneTransition` contract for the common
  (non-crossfade) case — a concrete subclass declares `getPhaseRequirements()`
  plus `enter()`/`exit()` render callbacks; session timing, easing, and
  the commit handoff between phases are handled once, internally.
- **Core built-in transitions.** `FadeSceneTransition`, `CrossFadeSceneTransition`,
  and `SlideSceneTransition` — a class-based, autocomplete-discoverable
  replacement for the old `{ type: 'fade' }` config-object shape (the only
  accepted form for `transition` is now a `SceneTransition`/
  `PhasedSceneTransition` instance).
- **`Scene.onActivate`/`Scene.onSuspend`.** Fire on every transition into
  `Active` (fresh activation, a consumed preload, or a restore) and on
  `Active → Suspended` (retention) respectively — the Scene-level
  counterparts `SceneScope.suspend()`/`.activate()` previously had no
  signal for.
- **Extension app-system bindings.** An `Extension.systems` binding
  (`ApplicationSystemBinding`) produces a `System` materialised once per
  `Application`, after every core manager exists, registered on
  `app.systems` — extensions can no longer only add renderers/assets/
  serializers.
- **`Scene.interaction`/`Scene.audio` facades** (`SceneInteraction`,
  `SceneAudio`) join the existing `Scene.inputs`/`Scene.tweens` — scene-scoped
  pointer capture/observation and scene-scoped playback, both auto-cleaned up
  on scene teardown and suspended/resumed across retention.
- **`PhysicsWorld.fixedUpdate()`** lets `@codexo/exojs-physics` register
  directly as a system (`app.systems.add(world, { order: SystemOrder.Physics
})`) instead of being stepped manually from `Scene.update()`.
- **Scene-less applications.** `new Application({ /* no scenes */ })` +
  `app.start()` runs the frame loop with no active scene at all —
  `app.systems` still ticks and draws.

### Changed

- **BREAKING — `SceneManager` renamed `SceneDirector`, `app.scene` renamed
  `app.scenes`.**
- **BREAKING — scene construction and navigation are constructor- or
  key-based, not instance-based.** `app.start(new GameScene())` → `new
Application({ scenes: { game: GameScene } })` + `app.start(GameScene,
data?)` or `app.start('game', data?)`; `app.scene.setScene(instance, opts)`
  → `app.scenes.change(Ctor | 'key', { data?, transition?, suspendCurrent? })`;
  `setScene(null)` is gone (start another scene, or `app.stop()`).
- **BREAKING — `setScene()`/`restoreScene()` renamed `change()`/`restore()`,
  and their `(data?, options?)` variadic argument pair collapses into one
  options object.** `setScene(X, data, { transition })` →
  `change(X, { data, transition })`. `retainCurrent` is renamed
  `suspendCurrent` (matches the state it produces, `SceneState.Suspended`).
- **BREAKING — `releaseScene()` renamed `unload()`, with explicit
  disambiguation instead of a silent priority order.** `releaseScene(X)` →
  `unload(X)`; a target with more than one coexisting activation (active +
  retained + preloaded) now requires `{ instance: '...' }` rather than
  resolving via an undocumented `retained → preloaded → active` priority.
- **BREAKING — the `transition` option no longer accepts a config object.**
  `{ transition: { type: 'fade', duration: 250 } }` →
  `{ transition: new FadeSceneTransition({ duration: 250 }) }` — note
  `duration` is now milliseconds, not seconds. `SceneTransition` is a class
  (abstract base + `FadeSceneTransition`/`CrossFadeSceneTransition`/
  `SlideSceneTransition`/`PhasedSceneTransition`), not a union type.
- **BREAKING — `scene.paused` is no longer a writable field.** It is now a
  read-only getter (mirroring `SceneDirector.paused`) toggled only via
  `app.scenes.pause()`/`resume()`.
- **BREAKING — `load`/`init` hooks take `data`, not a `Loader`.**
  `load(loader)`/`init(loader)` → `load(data)`/`init(data)`; access the
  loader via `this.loader`/`this.app.loader`. `init()` must be synchronous
  (a `Promise`-returning `init` is a dev-mode activation error) — move
  asynchronous setup into `load()`.
- **BREAKING — `System.destroy()` is optional**; a system implementing none
  of `fixedUpdate`/`update`/`draw` is no longer valid (at least one phase is
  required).
- **BREAKING — user app systems no longer reserve order `100`-`500`.** Core
  managers (input/interaction/audio/tweens/rendering) moved out of
  `app.systems` into an internal prepare stage; any plain `order` value is
  now safe for user systems.
- **BREAKING — `scene.systems` is attach-gated.** Register scene systems from
  `init()` — using `scene.systems` before the scene is attached now throws.
- **`Application.start()`'s startup sequencing** now starts the frame loop
  before awaiting the initial navigation, rather than after — required so a
  frame-driven `SceneTransitionSession` can progress on the very first
  scene activation instead of deadlocking.
- **`@codexo/exojs-physics`:** `PhysicsWorld` should be registered as a
  system rather than stepped manually; `step()` remains available for
  advanced manual driving.

### Removed

- **BREAKING — `Scene.onLoad`/`Scene.onUnload` removed.** Redundant with
  `SceneDirector.onStartScene`/`onStopScene` and the overridable
  `load()`/`unload()` methods themselves; replaced in spirit by the new
  `Scene.onActivate`/`onSuspend` for cross-cutting activation/retention
  concerns.
- **BREAKING — `super.destroy()` in a `Scene` subclass is no longer
  necessary.** The base `Scene.destroy()` is now empty — existing
  `super.destroy()` calls are harmless but can be deleted.

### Fixed

- **`SceneInteraction.suspend()`/`resume()`** now actually detach/reattach
  observed roots and captures (previously no-op stubs) — a retained scene no
  longer keeps receiving pointer dispatch alongside whichever scene is now
  active.
- **`SceneAudio.play()`** now gates playback requested while the scope is
  `Preparing`/`Ready`/`Suspended`, queuing it until the scene next activates,
  instead of starting audio for a scene that might never finish activating.
- **A throwing lifecycle listener** (`Scene.onActivate`/`onSuspend`,
  `Director.onStateChange`/`onChangeScene`/`onStartScene`/`onStopScene`) no
  longer aborts the remaining listeners or corrupts the `Signal`'s internal
  dispatch state — every listener runs, a throw is reported through
  `Application.onError` per-listener instead of propagating.

### Docs

- Migrated `examples/`, `@codexo/exojs-react`, the `create-exo-app`
  game-starter template, and the `runtime`/`recipes`/`integrations` guides to
  the `change()`/`restore()`/`unload()`/`preload()` navigation API and the
  class-based `SceneTransition`/`PhasedSceneTransition` system.
```

- [ ] **Step 3: Sanity-check formatting**

Run: `pnpm exec prettier --check CHANGELOG.md`
Expected: passes. If `CHANGELOG.md` is excluded from prettier's scope (check `.prettierignore` first), skip this step — do not run `--write` speculatively against a file prettier doesn't format.

- [ ] **Step 4: Commit**

```bash
git add CHANGELOG.md
git commit -m "docs: rewrite v0.17.0 CHANGELOG entry for the scene-transition/lifecycle redesign"
```

---

### Task 13: Full verification gate

**Files:** None new — verification only. This is the release gate for the entire 8-slice effort, not only this slice's own changes.

- [ ] **Step 1: Confirm Task 1's audit is now fully closed**

Re-run every grep from Task 1, Step 1:

```bash
grep -rn "setScene\|restoreScene\|releaseScene\|retainCurrent" src/ test/ packages/ examples/ site/src/ CHANGELOG.md
```

Expected: zero output, except inside `site/src/content/guide/shipping/v0-8-x-to-v0-9-0.mdx` (deliberately excluded, per Global Constraints) and below `CHANGELOG.md` line ~125 (`[0.15.2]` and earlier releases — now shifted by however many lines Task 12's rewrite added/removed; re-locate via `grep -n "^## \[0.15.2\]" CHANGELOG.md` rather than assuming line 125 still holds).

```bash
grep -rn "SetSceneOptions\|RestoreSceneOptions\|resolveSetSceneArgs\|_rollbackSwitch\|InstantSceneTransition\|SceneState\.Paused\|canPause(\|canResume(" src/ test/ packages/ examples/ site/src/
```

Expected: zero output.

```bash
grep -rn "\.onLoad\b\|\.onUnload\b" src/ test/ examples/ site/src/ packages/
```

Expected: zero output (the one previously-expected hit, `examples/application-scenes/scene-lifecycle.ts`, was fixed in Task 4).

- [ ] **Step 2: Full typecheck sweep**

Run: `pnpm typecheck && pnpm typecheck:guides && pnpm typecheck:examples && pnpm typecheck:type-tests && pnpm typecheck:packages`
Expected: no errors across the engine, guides, examples, type-level tests, and every `packages/exojs-*`/`exojs-react` package.

- [ ] **Step 3: Lint**

Run: `pnpm lint:all`
Expected: exits 0 (`pnpm lint` + `pnpm lint:packages`).

- [ ] **Step 4: Format check**

Run: `pnpm format:check`
Expected: exits 0.

- [ ] **Step 5: API docs sync check**

Run: `pnpm docs:api:check`
Expected: exits 0 (confirms Task 11's regeneration is still in sync with whatever Tasks 2–10's edits touched — none of those tasks change `src/` exports, so this should be a pure confirmation, not a surprise).

- [ ] **Step 6: The composed quick gate, as the pre-push hook will run it**

Run: `pnpm verify:quick`
Expected: exits 0. (This re-runs Steps 2–5 in the exact composition `package.json` defines — if it diverges from the results above, `package.json`'s `verify:quick` script changed since this plan was written; trust the live script over this plan's paraphrase.)

- [ ] **Step 7: Full multi-project test suite**

Run: `pnpm test`
Expected: PASS across every project — `exojs`, `exojs-particles`, `exojs-tilemap`, `exojs-tiled`, `exojs-physics`, `exojs-audio-fx`, `exojs-aseprite`, `exojs-ldtk`, `exojs-react`, `rendering-perf`. This is broader than `pnpm test:core` (the `exojs` project alone, 318 files / 5083 tests at this plan's baseline) — it is the first point in the entire 8-slice effort this plan requires running the complete suite, since Tasks 1–7's own scoped verification only covered `exojs`/`exojs-react`.

- [ ] **Step 8: Confirm no other package needed a source change**

Task 1's Step 1 grep already scoped across all of `packages/`; if Step 7 surfaces a failure in `exojs-particles`/`exojs-tilemap`/`exojs-tiled`/`exojs-audio-fx`/`exojs-aseprite`/`exojs-ldtk` referencing scene navigation, that is a genuine gap Task 1 missed (these packages don't call scene navigation directly per the audit, so a failure here more likely indicates a Slice 1–7 regression in shared engine behavior those packages depend on, not a Slice 8 sweep miss) — stop and report the specific failing test/assertion rather than patching around it; it is out of this slice's authority to redesign engine behavior to make it pass.

- [ ] **Step 9: Final commit check**

Run: `git status --short`
Expected: clean (every change from Tasks 1–12 already committed). If anything is unstaged (e.g. `pnpm format:check` or `pnpm lint:all` modified a file in place via an auto-fix path — neither command used above should, but confirm), stage and commit it with a message describing what the tool changed.

---

## Self-Review

**1. Spec coverage.** Every "Your slice's actual scope" bullet from the assignment maps to a task: `examples/` sweep → Tasks 2–4; `site/` guides sweep → Tasks 5–7, 10; generated API docs → Task 11; `CHANGELOG.md` → Task 12; full verification gate → Task 13; other-package scene-navigation check → folded into Task 1's audit (confirmed via grep across `packages/`, only `exojs-react`/`create-exo-app` had hits) plus Task 13 Step 8's explicit fallback if the full suite disagrees; leftover-name sweep across `src/`/`test/` → Task 1, Step 1's first two greps include `src/`/`test/` explicitly, with the expectation of zero hits there (Slices 1–7's own responsibility, this slice only confirms it).

**2. Placeholder scan.** Every step above either quotes exact current text with an exact replacement, gives a runnable command with a stated expected result, or (Task 1, Task 13 Step 1/8) is an audit step whose "no placeholder" content is the concrete grep command plus the itemized expected-hit list — not a vague "check for issues."

**3. Type consistency.** `change<C>(target, options)` / `restore<C>(target, options)` / `unload(target, options)` / `preload(target, data?)` are used identically in every task (Tasks 2, 3, 5, 6, 7, 8, 9, 10, 12) — no task calls it `changeScene()` or reintroduces `setScene`. `suspendCurrent` (never `retainCurrent`) is used consistently in Task 12's CHANGELOG text. `SceneTransitionSelection` (Task 8) vs. the concrete `FadeSceneTransition` class (Tasks 5, 7, 8, 10, 12) are used in the right positions — `SceneTransitionSelection` only where a prop/option accepts the full union (including `false`/phases), `FadeSceneTransition` only where an actual instance is constructed. `Scene.onActivate`/`onSuspend` (Task 4) match the names used in Task 12's CHANGELOG "Added" and "Removed" bullets.
