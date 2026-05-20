# Application Loop / Update-vs-Render Architecture Decision Review

**Date:** 2026-05-20
**Scope:** ExoJS — Application loop timing, update/render coupling, hidden-tab semantics, future loop options
**Source authority:** `src/core/Application.ts`, `Clock.ts`, `Time.ts`, `Timer.ts`, `Scene.ts`, `SceneManager.ts`, `RenderNode.ts`, `TweenManager.ts`, `Tween.ts`, `ParticleSystem.ts`, `InputManager.ts`, `InteractionManager.ts`, `View.ts`, `PerformanceLayer.ts` — all read directly from HEAD of `main`.
**Status:** Decision-grade — actionable before 0.9.0.

---

## 1. Executive Verdict

**The current architecture is already Option B. The primary structural work for 0.9.0 is not a redesign — it is one targeted fix and one API decision.**

The existing RAF-driven loop with separated update and render phases is the correct model for ExoJS. No loop architecture change is required. However, one silent runtime hazard — a delta spike after `pauseOnHidden` resumes — needs a `maxDeltaMs` guard before 0.9.0. The deferred loop options (`fpsLimit`, `backgroundFpsLimit`) should receive explicit final verdicts now, rather than being left open-ended.

| Item | Decision |
|---|---|
| Keep variable-timestep RAF loop | **Yes — confirmed correct** |
| Separate update and render phases | **Already done — confirm and document** |
| Add `maxDeltaMs` guard | **Yes — before 0.9.0** |
| Add fixed timestep | **No — premature, defer until physics** |
| `fpsLimit` | **Defer — not before 0.9.0** |
| `backgroundFpsLimit` | **Reject concept** |
| New `loop:` options group | **Defer — not before 0.9.0** |
| Physics readiness from current model | **Good — no architecture change needed first** |

---

## 2. Current Architecture Audit

### 2.1 The Outer Scheduler

`requestAnimationFrame` is the **sole scheduler**. There are no `setInterval`, `setTimeout`, or Web Worker-based tickers anywhere in the engine. RAF callbacks fire at the display refresh rate, browser-throttled to ~1 Hz in hidden tabs.

### 2.2 Control Flow (One Frame)

```
RAF callback → Application.update()
│
├─ guard: pauseOnHidden && !_documentVisible → reschedule RAF, return early
│
├─ frameDelta = _frameClock.elapsedTime          ← performance.now() delta
├─ frameStart = performance.now()
│
├─ backend.resetStats()
├─ input.update()                                ← flush key/pointer state, poll gamepads
├─ interaction.update()                          ← pointer hit-testing
├─ AudioManager.update()                         ← spatial audio per-frame work
├─ tweens.update(frameDelta.seconds)             ← advance all active Tweens
├─ runtimeView?.update(frameDelta.milliseconds)  ← View camera shake / follow
│
├─ sceneManager.update(frameDelta)
│   ├─ _advanceTransition(delta.milliseconds)
│   ├─ _resolveParticipants()                    ← stack policy (opaque/modal/overlay)
│   ├─ for each updateScene: scene.update(delta) ← USER UPDATE CODE
│   └─ for each drawScene:  scene.draw(backend)  ← USER DRAW CODE
│
├─ onFrame.dispatch(frameDelta)                  ← DebugOverlay, user subscribers
├─ backend.flush()                               ← submit GPU commands
├─ stats.frameTimeMs = performance.now()-frameStart
├─ reschedule RAF
├─ _frameClock.restart()
└─ _frameCount++
```

### 2.3 Update/Render Coupling Assessment

Update and render are **not fully coupled**. `SceneManager.update()` explicitly separates the two passes:

1. All participating scenes run `scene.update(delta)` in stack order.
2. All participating scenes run `scene.draw(backend)` in stack order.

This is already Option B semantics within a single RAF tick. The separation is not architecturally visible to users at the Application level (there is no `app.renderPhaseBegin` signal), but it exists and is enforced. The main loop comment in `Application.update()`'s JSDoc does not reflect this phase structure clearly — that is a documentation gap, not an architectural one.

### 2.4 Delta Measurement

`_frameClock` uses `performance.now()` via `getPreciseTime()`. The RAF callback signature (`DOMHighResTimeStamp`) is not used — the time is captured when `_frameClock.elapsedTime` is first read inside the frame body. This adds a small, typically sub-millisecond skew from the actual RAF timestamp. This is not a problem in practice but is worth noting.

`frameDelta` at frame N = wall-clock milliseconds elapsed since `_frameClock.restart()` at the end of frame N-1.

The `Clock.elapsedTime` getter advances the internal accumulator on every read, updating `_startTime` to `now`. Multiple reads within a frame are additive, not duplicated.

### 2.5 Systems Driven by the Loop

| System | Driver | Unit |
|---|---|---|
| Input state flush | `Application.update()` directly | — |
| Interaction (hit-testing) | `Application.update()` directly | — |
| Audio | `Application.update()` directly | — |
| **Tweens** | `Application.update()` directly | seconds |
| View (camera shake/follow) | `Application.update()` → `runtimeView.update()` | milliseconds |
| Scene logic | `SceneManager.update()` → `scene.update(delta)` | Time object |
| Scene rendering | `SceneManager.update()` → `scene.draw(backend)` | — |
| **ParticleSystem** | User-driven: `scene.update()` → `particleSystem.update(delta)` | Time object |
| AnimatedSprite | User-driven: `scene.update()` → `sprite.update(delta)` | Time or number |
| DebugOverlay | `app.onFrame` subscriber | Time |

Notably, `ParticleSystem.update()` is **not automatically driven by the Application** — users must call it from `scene.update()`. This is consistent with ExoJS's explicit-not-implicit identity and creates a natural user-enforced update/render separation for particles.

### 2.6 Hidden-Tab Behavior

**`pauseOnHidden = false` (default):**
- RAF still fires; browsers throttle hidden tabs to ~1 Hz
- The entire update+render loop runs at ~1 fps with large deltas (potentially ~1000ms)
- Tweens, particles, scenes advance at the throttled rate
- Battery impact; animation state advances while invisible

**`pauseOnHidden = true`:**
- RAF fires but `update()` returns early; no simulation or rendering occurs
- `_frameClock` is NOT restarted during skip (restart only happens at end of normal frame body)
- **Critical bug:** on the first frame after tab becomes visible again, `frameDelta = _frameClock.elapsedTime` accumulates the full hidden duration — potentially minutes — producing a massive single-frame delta spike

This bug makes `pauseOnHidden = true` unsafe without a `maxDeltaMs` cap. The default `pauseOnHidden = false` avoids the spike but instead produces large-but-bounded deltas from browser throttling.

### 2.7 Role of `pauseOnHidden`

A public mutable property on `Application`. Default `false`. Its JSDoc correctly describes the behavior. The intent is games vs. tools: games pause when hidden; editor tools or background simulations do not. The mechanism is sound; the implementation has the spike bug documented above.

---

## 3. Options Evaluated

### Option A — Fully Coupled RAF Loop

```
RAF → update(delta) + render()
```

The current implementation is *superficially* this, but `SceneManager` already internally separates the two phases. True Option A would mean update and draw code interleaved in a single scene method, which ExoJS explicitly rejects (distinct `update()` and `draw()` hooks).

**Assessment:**
- Simple to reason about
- No extra frame-phase signals needed
- Sufficient for 2D at moderate scale
- Does not support render FPS limiting without introducing an inner skip
- Accepted as the outer-loop architecture; the phase separation inside is correct

### Option B — Separated Update and Render Phases, Variable Timestep (Current Model)

```
RAF tick:
  accumulate real delta
  run 1 update(delta)      ← variable timestep
  run 1 render pass
```

ExoJS already implements this with the `scene.update()` / `scene.draw()` separation in `SceneManager`. The phases share the same `delta` object (no separate simulation delta vs. render delta).

**Assessment:**
- Correct for 2D animations, tweens, particles
- No determinism requirement for current scope
- Input latency: one update per frame, input applied the same frame — good
- Tween semantics: wall-clock aligned, no complications
- Particle semantics: user-driven, works correctly with variable delta
- Render FPS limiting could be layered on top (skip `draw()` based on elapsed-since-last-render) without changing the outer loop
- This is the recommended model — **no change needed to the outer loop architecture**

### Option C — Fixed Update Step + Decoupled Rendering

```
RAF tick:
  accumulate += realDelta
  while accumulate >= fixedStep:
      update(fixedStep)
      accumulate -= fixedStep
  render(accumulate / fixedStep)  ← interpolation blend
```

**Assessment:**
- Required for deterministic physics simulation
- Introduces "spiral of death" if update is too slow (must be guarded by `maxUpdateStepsPerFrame`)
- Render interpolation requires double-buffered state (current + previous positions for all entities)
- Tweens would require wall-clock tracking separate from fixed-step clock, or special handling
- AnimatedSprite and particle system would need review for fixed-step semantics
- Adds meaningful implementation complexity with no current payoff
- No physics integration exists to justify this yet
- **Reject for pre-1.0 core. Evaluate specifically when a physics integration requirement arises.**

### Option D — Fully Separate Schedulers (Update Timer + Render RAF)

```
setInterval(update, 1000/targetHz)   // simulation
RAF → render()                        // rendering
```

**Assessment:**
- `setInterval` is throttled in hidden tabs to ~1 Hz, same as RAF — no advantage there
- Timer precision is worse than RAF; browsers may delay timers under load
- Introducing cross-scheduler synchronization (ensuring render always has a consistent world state) requires explicit locking or double-buffering
- Adds complexity for zero benefit in a browser environment
- Does not align with how browsers schedule GPU work
- **Reject entirely for ExoJS.** The browser environment makes this unnecessary and fragile. Any future "simulate at a rate different from render rate" requirement should be Option C (fixed step within a single RAF tick), not fully separate schedulers.

---

## 4. Browser Runtime Considerations

### RAF Cadence and Display Coupling

`requestAnimationFrame` fires in sync with the display refresh. On a 60 Hz display, callbacks fire every ~16.7ms. On 120 Hz monitors, ~8.3ms. The browser handles scheduling, backpressure, and V-sync alignment. No game engine code can do better than RAF for rendering, and no game engine code needs to.

The RAF callback timestamp represents when the browser compositor began preparing the current frame. Using it (instead of `performance.now()`) for delta measurement is more accurate for animation because it excludes queuing latency from previous frame. ExoJS's current use of `performance.now()` via Clock is a minor deviation but not a problem at the scale of 2D games.

### Hidden-Tab Behavior

Browsers impose hard throttling on background tabs:
- RAF: throttled to ~1 Hz
- `setInterval`/`setTimeout`: throttled to ~1 Hz minimum, sometimes 1+ seconds
- Web Workers: similar throttling applies to their timers

This means: **there is no reliable way to run a game simulation at meaningful update rates in a hidden tab using browser timers**. Any attempt to maintain a "background update rate" will be browser-defeated. The only reliable hidden-tab behavior is: pause everything. `pauseOnHidden = true` is the right primitive; it just needs the delta spike fixed.

### Page Visibility API

`document.addEventListener('visibilitychange', ...)` is implemented in ExoJS and drives `_documentVisible`. The API is reliable across all target browsers. The `onVisibilityChange` signal is correctly dispatched and already used by the audio manager to pause/resume audio.

### Timer Throttling

`setTimeout` and `setInterval` cannot substitute for RAF in the render path. They cannot produce sub-16ms cadence in background tabs and their accuracy degrades under any background throttling. Using them for "background simulation" would require writing code that is defeated by the browser and difficult to reason about. There is no ExoJS use case that justifies this complexity.

### Why Pure `setInterval` Simulation Should Be Rejected

Some engines use `setInterval` for simulation and RAF for rendering (Option D). In the browser:
- `setInterval` accuracy is low (±15ms typical on Windows, worse under throttling)
- Synchronizing simulation state with render state across two schedulers requires locks or double-buffering
- Neither advantage (decoupled rate) nor disadvantage (staleness) is meaningful for a 2D game engine without deterministic physics
- **Reject.**

---

## 5. Recommended Architecture

**Keep Option B. Add one delta guard. Document the phase structure.**

The recommended loop model:

```
RAF callback → Application.update()
│
├─ if (pauseOnHidden && !visible):
│   ├─ _frameClock.restart()                     ← PROPOSED FIX
│   └─ reschedule RAF, return
│
├─ rawDelta = _frameClock.elapsedTime.milliseconds
├─ clampedDeltaMs = min(rawDelta, _maxDeltaMs)   ← NEW: delta guard
├─ frameDelta = Time(clampedDeltaMs)
│
│   [UPDATE PHASE]
├─ input.update()
├─ interaction.update()
├─ AudioManager.update()
├─ tweens.update(frameDelta.seconds)
├─ runtimeView?.update(frameDelta.milliseconds)
├─ sceneManager: for each updateScene → scene.update(frameDelta)
│
│   [RENDER PHASE]
├─ sceneManager: for each drawScene → scene.draw(backend)
├─ transition overlay (if active)
├─ onFrame.dispatch(frameDelta)
├─ backend.flush()
│
├─ _frameClock.restart()
└─ reschedule RAF
```

**What changes from today:**

1. **`_frameClock.restart()` inside `pauseOnHidden` early return** — prevents delta spike on resume.
2. **`maxDeltaMs` cap applied to `frameDelta`** — internal by default, possibly user-configurable.
3. **Documentation of the two-phase structure** — currently underdocumented.

**What does not change:**
- RAF as sole scheduler
- Variable timestep
- Single RAF tick per frame cycle
- `Scene.update()` / `Scene.draw()` separation
- All subsystem update order

---

## 6. Public API Consequences

### 6.1 `ApplicationOptions` — No New Group Yet

The current options structure is:
```ts
interface ApplicationOptions {
  clearColor?: Color;
  backend?: BackendConfig;
  canvas?: CanvasApplicationOptions;
  loader?: LoaderOptions;
  rendering?: RenderingApplicationOptions;
  input?: InputApplicationOptions;
}
```

If loop-related options are eventually introduced, they should live in a new `loop` group:
```ts
interface ApplicationOptions {
  // ... existing groups ...
  loop?: LoopOptions;
}
```

**For 0.9.0: do not add the group yet.** The only pre-0.9.0 change is the internal `maxDeltaMs` guard, which may or may not be exposed publicly. See §6.4.

### 6.2 FPS Limit Concept

**Verdict: do not add `fpsLimit` before 0.9.0.**

If added later, `fpsLimit` should be understood as a **render FPS limit only**, not a whole-loop rate limit. The implementation would be: track time since last `scene.draw()` call; skip the draw phase if insufficient time has passed; always run the update phase at full RAF rate.

This means `fpsLimit` logically belongs in a `rendering` group — or in a future `loop` group if the semantic is "max renders per second." Neither is correct to introduce before the user need is demonstrated.

If update and render are already separated (they are), a future `rendering.fpsLimit` option is a clean addition that does not require loop architecture changes.

A **whole-loop FPS limiter** (skip input + update + render) is almost never correct for games — it increases input latency and does not save meaningful CPU. Reject this interpretation.

### 6.3 Background Updates

**Verdict: reject `backgroundFpsLimit` as a concept.**

The rationale:
- In hidden tabs, RAF fires at ~1 Hz regardless of any rate limit configured
- A "background FPS limit" would only matter if there were a separate simulation timer running independent of RAF
- There is no such timer in ExoJS, and adding one (Option D) was rejected
- `pauseOnHidden = true` is the correct primitive: either you need the game to continue (use default `false` and accept browser throttling) or you don't (use `true`)

If a best-effort hidden-tab simulation is ever needed, the correct primitive is `pauseOnHidden = false`, and the developer accepts that browsers will throttle to ~1 Hz. There is nothing ExoJS can do to override browser scheduling policy.

**Replace `backgroundFpsLimit` with nothing.** Document `pauseOnHidden` clearly instead.

### 6.4 `maxDeltaMs`

**Verdict: add internal `maxDeltaMs` before 0.9.0, expose as configurable under `loop.maxDeltaMs` (deferred to when the `loop` group is introduced).**

What it caps: the `frameDelta` value passed to all update recipients (`scene.update()`, `tweens.update()`, `particleSystem.update()`, and the internal View update). It does not cap real time — it caps the *simulated time* per frame.

Rationale:
- Without it, `pauseOnHidden = true` produces a delta spike on resume (documented bug in §2.6)
- Without it, a debug breakpoint or system sleep produces a multi-second delta that breaks all animations
- Without it, slow frames on low-end devices may produce deltas large enough to tunnel particles through walls or tween from 0 to 1 in a single frame

**Recommended default: `100ms`.** This is 2× a 20fps frame at 50ms, so it only activates in genuinely degraded situations, not during normal frame variance.

**Scope: it caps simulation delta, not render delta or real time.** The clock still advances correctly; only the value passed to update methods is clamped.

**Exposure:**
- Implemented internally in `Application.update()` immediately (before 0.9.0)
- Exposed publicly when a `loop` options group is introduced (after 0.9.0)
- No breaking change: adding clamping to a previously unclamped value is a fix, not a behavior-breaking rename

**Naming:** `maxDeltaMs` or `maxSimulationStepMs`. The former is shorter and established; prefer it.

---

## 7. System Consequences

### Scenes

`Scene.update(delta: Time)` and `Scene.draw(backend: RenderBackend)` are already separated. They remain unchanged under Option B.

The `delta` passed to `scene.update()` is the clamped `frameDelta` once `maxDeltaMs` is in place. Users who call `particleSystem.update(delta)` or `sprite.update(delta)` from `scene.update()` automatically benefit from the cap.

There is no automatic scene-graph traversal for update — users drive `particleSystem.update()`, `sprite.update()`, etc. explicitly. This is correct and should remain unchanged.

### Tweens

Tweens receive `frameDelta.seconds` from `Application.update()`. They are wall-clock-aligned: a tween configured for `1.5` seconds completes in 1.5 real seconds, regardless of display refresh rate.

Under the proposed `maxDeltaMs` guard, tweens receive the clamped delta. This means:
- A 100ms cap means a tween that was paused for 30 minutes will advance by at most 100ms on resume — correct behavior
- Tween durations remain wall-clock semantics under normal operation
- No tween-specific changes required

**Tweens should NOT receive a fixed timestep if Option C were ever adopted.** Under fixed-step updates, a tween that runs for 0.5 real seconds might execute 30 fixed steps (at 60Hz fixed rate). The tween system's elapsed counter would need to be fed wall-clock deltas, not fixed-step deltas. This is a key reason fixed-step adds complexity for tween-heavy projects — it requires a separate "real time" concept for non-physics subsystems.

Under the current variable-step model, tweens are architecturally clean. Nothing needs to change.

### Particles

`ParticleSystem.update(delta: Time)` is user-driven from `scene.update()`. This is the correct model: the user decides which particle systems update each frame and in what order. There is no hidden auto-advance.

Under `maxDeltaMs`, when `scene.update(delta)` is called with the clamped delta, any `particleSystem.update(delta)` call inside also receives the clamped delta. Particle simulation stability improves.

GPU-path particles (`_gpuMode = true`) use `delta.seconds` for spawn and expiry logic; the compute shader handles integration. The clamped delta will reduce the risk of oversized GPU dispatches after resume.

Fixed timestep would complicate particle semantics: spawn rates (particles/second) and physics integration (RateSpawn, velocity integration) are defined in real time. Under fixed steps, the particle system would need to run its own accumulator or be redesigned. **This is another reason to keep variable-step for now.**

### Input

Input is updated before scene update: `input.update()` runs, flushing event queues and polling gamepads. Input state is committed before `scene.update(delta)` runs. This is the correct order: input is sampled at the start of the logical frame, applied to game state in update, rendered in draw.

Under `maxDeltaMs`, input sampling is unaffected — it always runs at real time. The cap only affects how much simulated time advances.

Input latency is one RAF frame (16.7ms at 60Hz). A render FPS limiter (skipping draw phase) would not increase input processing latency, since input runs before the draw decision. This is a reason to make any future FPS limiter render-only.

### Profiling / Debugging

`PerformanceLayer` currently displays:
- Rolling-average FPS (computed from `delta.milliseconds` samples)
- Per-frame time in milliseconds
- Draw call count
- Scene node count
- 120-sample frame-time sparkline

Under Option B with `maxDeltaMs`, the measured `frameDelta` passed to `PerformanceLayer` via `app.onFrame` should be the **raw (unclamped) delta**, not the clamped one. Otherwise the performance overlay would show artificially reduced frame times after a spike.

This requires a small design decision: does `onFrame` receive the clamped or raw delta?

**Recommendation:** `onFrame` should receive the clamped delta (consistent with what scenes receive), but `backend.stats` should expose `rawFrameDeltaMs` alongside `frameTimeMs`. Future profiling tooling can then distinguish:
- `rawFrameDeltaMs`: actual wall-clock elapsed (real world measurement)
- `frameTimeMs`: CPU time spent in the frame body
- The clamped delta: what the simulation actually consumed

For future profiling goals, the following stats are worth tracking (they can be added to `RenderStats` or a new `FrameStats`):
- Update-phase CPU time (time for `scene.update()` across all scenes)
- Render-phase CPU time (time for `scene.draw()` + `flush()`)
- Clamped delta vs. raw delta (to detect spike events)
- UPS vs. render FPS (always the same under Option B, differs only if a render FPS limiter is introduced)

---

## 8. Physics Future-Readiness

### Current Position

ExoJS has no physics system. The question is whether the current loop architecture paints it into a corner.

### What Physics Actually Requires

A lightweight 2D physics integration (AABB/circle collision + simple force integration) can work with variable timestep if:
- Collision detection is spatial-hash based (no continuous collision detection needed for simple shapes)
- Integration uses Euler or Verlet with small, bounded steps

For this level of physics, variable-step with `maxDeltaMs` is sufficient. The cap ensures steps are never large enough to tunnel fast-moving objects through walls (with appropriate step size limits).

A proper constraint-based physics solver (Box2D style) requires fixed timestep for stability. Constraint solvers iterate to convergence over a fixed time window; variable steps break the convergence guarantees.

### Architecture Impact

If fixed-step physics is introduced later, the recommended approach is:

1. Keep the outer loop as Option B (variable step RAF)
2. Introduce an internal fixed-step physics sub-loop within `Application.update()` or within a dedicated `PhysicsManager`:
   ```
   RAF tick:
     rawDelta = _frameClock.elapsedTime
     clampedDelta = min(rawDelta, maxDeltaMs)
     _physicsAccumulator += clampedDelta
     while _physicsAccumulator >= _physicsStep:
         physicsWorld.step(_physicsStep)
         _physicsAccumulator -= _physicsStep
     interpolationAlpha = _physicsAccumulator / _physicsStep
     scene.update(clampedDelta)     // non-physics game logic
     scene.draw(backend)            // rendering with optional interpolation
   ```
3. Render interpolation becomes a physics-system concern, not an ExoJS core concern — the physics integration layer decides whether to expose interpolated positions to rendering

This architecture isolates fixed-step complexity to the physics subsystem. The outer loop does not need to know or care. The ExoJS scene graph, tweens, particles, and input all continue to receive the clamped variable delta.

**Conclusion: the current Option B architecture does not prevent future physics integration.** The variable-step outer loop is compatible with a future fixed-step physics sub-loop. No loop change is needed now to preserve that path.

---

## 9. What to Implement When

### Must Decide Now Before 0.9.0

**Fix the `pauseOnHidden` resume delta spike.**
Implementation: add `_frameClock.restart()` inside the early-return path. Trivial one-line fix with real user-visible impact.

**Add internal `maxDeltaMs` guard.**
Implementation: ~3 lines in `Application.update()`. Apply before computing `frameDelta`; cap at 100ms by default. Internal constant for now. Prevents animation explosions on debug-pause, slow devices, and post-hidden-resume.

**Give `maxDeltaMs` a clearly named internal constant.**
Even if not yet user-configurable, naming it `DEFAULT_MAX_DELTA_MS = 100` makes the intent explicit and the value discoverable for future exposure.

### Should Implement Before 0.9.0

**Document the two-phase loop structure.** The `Application.update()` JSDoc lists the step order but does not call out "UPDATE PHASE" and "RENDER PHASE" as distinct concepts. Update the JSDoc to reflect the current structure — this aligns docs with the architecture ExoJS already implements and sets correct expectations for users.

**Expose raw frame delta in stats.** Add `rawFrameDeltaMs` or equivalent to `backend.stats` (or a new `Application.stats` object) so profiling tools can distinguish clamped simulation time from real frame time.

### Additive Later (After 0.9.0)

**`loop.maxDeltaMs` in `ApplicationOptions`.**
Once a `loop` group exists, expose the internal constant as a user-configurable option.

**Render-only FPS limiter (`rendering.fpsLimit`).**
Add only if user demand exists. Implementation: track `_lastRenderTime`, skip `scene.draw()` if `elapsed < 1000/fpsLimit`. Update + input always run at full RAF rate.

**Separate update-phase timing in `FrameStats`.**
When profiling tooling is built, split `frameTimeMs` into `updateTimeMs` and `renderTimeMs`.

### Reject / Defer

**Fixed timestep** — defer until a physics integration requirement is concrete. Not for 0.9.0.

**`backgroundFpsLimit`** — reject the concept. Browser scheduling defeats it. `pauseOnHidden` is the correct model.

**Option D (separate schedulers)** — rejected. Browser environment makes this fragile and unnecessary.

**Render FPS limiter before 0.9.0** — no demonstrated user need. No explicit user request in issue tracker. Defer.

**Automatic scene-graph update traversal** — inconsistent with ExoJS's explicit identity. Reject.

**Transform interpolation in core** — premature until fixed-step physics exists. Reject.

---

## 10. Direct Answers

| # | Question | Answer |
|---|---|---|
| 1 | Should ExoJS separate update and render? | Already separated in `SceneManager.update()`. Confirm, document, do not change. |
| 2 | Should ExoJS adopt fixed-step updates? | No. Variable timestep is correct for current scope. Evaluate only when physics is concrete. |
| 3 | Should rendering remain RAF-driven? | Yes, unconditionally. RAF is the only correct browser render scheduler. |
| 4 | Should there be hidden-tab background update support? | No. Pause-only model (`pauseOnHidden`) is correct. Fix the resume delta spike. |
| 5 | Should `fpsLimit` exist, and what does it limit? | Not before 0.9.0. If introduced later: render-only limiter, lives in `rendering` or `loop` group. |
| 6 | Should `backgroundFpsLimit` exist? | Reject concept entirely. Browser throttling defeats it; `pauseOnHidden` is the primitive. |
| 7 | Should `maxDeltaMs` exist, and what does it cap? | Yes, before 0.9.0. Caps the simulation delta per frame (what is passed to update methods). Default 100ms. Internal now; user-configurable later under `loop`. |
| 8 | Should new loop options live under a new group? | Yes, when introduced: `loop: LoopOptions`. But do not add the group before 0.9.0. |
| 9 | How should Tweens behave under chosen architecture? | Unchanged. Receive clamped variable delta in seconds. Wall-clock alignment preserved. |
| 10 | Best architecture for profiling and physics? | Option B + `maxDeltaMs` + separation of update/render timing in stats. Physics can add a fixed-step sub-loop internally without touching the outer loop. |

---

## 11. Final Recommendation

**Keep current coupled RAF loop for 0.9.0; apply two targeted fixes.**

The ExoJS Application loop is architecturally correct for its current scope. The two-phase update/render structure already exists and is enforced by `SceneManager`. Variable timestep is the right model. RAF is the right scheduler.

The work for 0.9.0 is not a redesign — it is two small, contained fixes:

1. **Fix `pauseOnHidden` resume spike** (one line: `_frameClock.restart()` in the early-return path).
2. **Add `maxDeltaMs` internal guard** (~3 lines: clamp `frameDelta` to a constant before passing it to all update recipients).

These two changes together eliminate the only known runtime hazard in the current loop and make `pauseOnHidden = true` safe to use as documented.

Everything else — fixed timestep, FPS limiting, background simulation, a `loop` options group — is deferred. These are additive features that require concrete motivation and have no pre-1.0 urgency. The current architecture does not foreclose any of them.

The recommended internal implementation change (illustrative):

```ts
public update(): this {
  if (this._status === ApplicationStatus.Running) {
    if (this.pauseOnHidden && !this._documentVisible) {
      this._frameClock.restart();             // FIX: prevent delta spike on resume
      this._frameRequest = requestAnimationFrame(this._updateHandler);
      return this;
    }

    const rawDeltaMs = this._frameClock.elapsedTime.milliseconds;
    const clampedDeltaMs = Math.min(rawDeltaMs, MAX_DELTA_MS);  // NEW: delta guard
    const frameDelta = new Time(clampedDeltaMs);                 // or reuse scratch Time

    // ... rest of frame body uses frameDelta ...
  }
  return this;
}

const MAX_DELTA_MS = 100;
```

This change is self-contained, non-breaking, and directly addresses both the `pauseOnHidden` bug and the general frame-spike hazard. It requires no public API changes for 0.9.0.
