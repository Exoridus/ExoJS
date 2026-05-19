# ExoJS Pre-v0.9.0 API & Product Ergonomics Review

## 1. Executive verdict
- API direction: strong. The post-v0.8.4 codebase is coherent, explicit, and materially more capable while still preserving ExoJS' explicit-draw identity.
- v0.9.0 timing: near, but not immediate. A small set of contract-level and DX issues should be fixed first (especially scene input semantics correctness).
- Identity continuity: mostly preserved. Current ExoJS feels like a natural extension of earlier ExoJS, not a directional drift, but with higher conceptual density.

## 2. Top findings
1. **Scene input consumption contract is inverted in runtime routing**
- Problem: `Scene.handleInput` docs and Guide state "return `true` consumes", but runtime breaks propagation on `handled === false`.
- Why it matters: This is a correctness bug in a central control surface (scene stacks, pause overlays, modal scenes).
- Repo evidence: `src/core/Scene.ts:260-263`, `site/src/content/guide/core-concepts/scene-lifecycle.mdx:32`, `src/core/SceneManager.ts:464-467`.
- Suggested direction: Align runtime with docs (`true` consumes), add a migration note because some users may have coded around current behavior.
- Breaking or non-breaking?: Behavior-breaking bug fix (API-shape non-breaking).
- Classification: Core.
- Priority: Must before 0.9.0.

2. **Scene stack input ergonomics are subtle because two input paths coexist**
- Problem: Scene-level routing (`handleInput`) is stack-aware, but `this.inputs` binds directly to `app.input` and bypasses scene input-mode propagation.
- Why it matters: Pause/HUD patterns require manual gating and are easy to misuse.
- Repo evidence: `src/core/Scene.ts:22-35`, `site/src/content/guide/recipes/pause-menu.mdx:76`, `site/src/content/guide/recipes/hud-overlay.mdx:67`.
- Suggested direction: Add a stack-aware scene binding surface (additive) and keep current `this.inputs` as explicit global binding API.
- Breaking or non-breaking?: Non-breaking (additive) if introduced as new API.
- Classification: Core.
- Priority: Strong.

3. **Loader ergonomics are mostly strong, but docs + usage patterns still create friction**
- Problem: Repeated `loader.get(Type, alias)` is everywhere; manifest docs currently show stale shape.
- Why it matters: Friction appears in almost every example path and directly affects first-week DX.
- Repo evidence: frequent usage across `examples/**` and Guide; stale snippet in `site/src/content/guide/core-concepts/loading-and-resources.mdx:118-135`; actual manifest contract in `src/resources/AssetManifest.ts:24-26`.
- Suggested direction: Fix manifest docs immediately; add a small ergonomic layer (typed alias getters / scene resource contracts) instead of factory classes.
- Breaking or non-breaking?: Non-breaking.
- Classification: Core.
- Priority: Must before 0.9.0 (docs correctness) + Strong (ergonomic helper).

4. **Pointer/screen/world conversion requires too much repeated boilerplate**
- Problem: Guide/examples require manual clip-space math and direct matrix field access.
- Why it matters: This is common gameplay plumbing and currently too low-level for routine use.
- Repo evidence: `site/src/content/guide/input/mouse-and-pointer.mdx:125-139`, `examples/input/pointer-to-world.js:30-40`, `examples/application-scenes/world-vs-screen-coords.js:36-46`, `src/rendering/View.ts:386`.
- Suggested direction: Add `View.screenToWorld(...)` and `View.worldToScreen(...)` helpers.
- Breaking or non-breaking?: Non-breaking.
- Classification: Core.
- Priority: Strong.

5. **Text/font API is clear for loading, but layout capabilities are visibly partial**
- Problem: Many style fields are stored but not rendered; wrap/measurement/story is incomplete.
- Why it matters: UI-heavy projects hit this quickly.
- Repo evidence: `src/rendering/text/TextLayout.ts:17-19`, `site/src/content/guide/drawing/text.mdx:87`, `site/src/content/guide/drawing/text.mdx:103`, `site/src/content/guide/drawing/text.mdx:150`.
- Suggested direction: Before 0.9, add minimal `measure` API and basic word-wrap, or narrow public style claims more aggressively.
- Breaking or non-breaking?: Non-breaking if additive implementation.
- Classification: Core.
- Priority: Strong.

6. **Tween API is mostly coherent, but chain semantics are an avoidable trap**
- Problem: `chain()` returns the next tween, not `this`; users must preserve first-tween reference.
- Why it matters: Adds avoidable cognitive overhead in a core animation API.
- Repo evidence: `src/animation/Tween.ts:245-253`, Guide caveat at `site/src/content/guide/drawing/animation.mdx:125`, plus manager clear semantics `src/animation/TweenManager.ts:72-77`.
- Suggested direction: Keep current API but add an additive chain helper with less surprising return behavior.
- Breaking or non-breaking?: Non-breaking if additive.
- Classification: Core.
- Priority: Strong.

7. **Async update/draw semantics are effectively sync-only but not explicit enough in guidance**
- Problem: `update`/`draw` are synchronous in type and runtime loop; async returns are not awaited.
- Why it matters: Users may accidentally create racey frame logic.
- Repo evidence: `src/core/Scene.ts:236`, `src/core/Scene.ts:255`, `src/core/SceneManager.ts:238-243`, `src/core/Application.ts:317-320`.
- Suggested direction: Explicit Guide warning + optional dev-time warning if a Promise is returned from frame hooks.
- Breaking or non-breaking?: Non-breaking.
- Classification: Core.
- Priority: Strong.

8. **Collision system is useful, but orchestration remains manual and pair support is uneven**
- Problem: Detection and response are solid for many pairs, but registration/groups/triggers/world orchestration is DIY.
- Why it matters: Teams quickly rebuild the same helper layer.
- Repo evidence: `site/src/content/guide/advanced/collision-detection.mdx:70-77`, `site/src/content/guide/advanced/collision-detection.mdx:116-137`, `src/math/swept-collision.ts:122-132`.
- Suggested direction: Keep core detection-first; provide `CollisionWorld` utilities in Extras/separate package.
- Breaking or non-breaking?: Non-breaking.
- Classification: Extras.
- Priority: Nice.

9. **Root API breadth is still large relative to a future stable contract**
- Problem: Broad root exports include deep backend internals; users cannot easily tell stable vs advanced contracts.
- Why it matters: Pre-1.0 churn risk and harder 1.0 promise-setting.
- Repo evidence: `src/index.ts:1-8`, `src/rendering/index.ts:1-59`.
- Suggested direction: Introduce explicit stability tiers in docs/API pages before freezing 0.9+ semantics.
- Breaking or non-breaking?: Non-breaking if documentation/annotation first.
- Classification: Core.
- Priority: Strong.

10. **Application resize/DPR setup still has recurring boilerplate**
- Problem: Common resize and DPR handling is manual in examples.
- Why it matters: Nearly every production app needs this pattern.
- Repo evidence: `examples/getting-started/resize-and-dpr.js:13-24`, options surface in `src/core/Application.ts:30-46`.
- Suggested direction: Add optional `autoResize`/DPR policy in `ApplicationOptions`.
- Breaking or non-breaking?: Non-breaking.
- Classification: Core.
- Priority: Nice.

## 3. API areas reviewed
- Scenes / SceneManager: Core architecture is good; stack semantics are powerful, but input-routing correctness and clarity need tightening (`src/core/SceneManager.ts`, scenes/pause/HUD guide chapters).
- Signals & event handling: `Signal` is simple and safe (snapshot dispatch) but no evidence it is a current bottleneck; runner-style rewrite is not justified pre-0.9 (`src/core/Signal.ts:110-116`).
- Loader/resources: Strong typed token model and manifest support; docs mismatch and retrieval ceremony are real DX friction (`src/resources/Loader.ts`, `AssetManifest.ts`, loading guide).
- Scene graph/transforms/view: Fundamentally solid and identity-consistent; no skew API; world/screen conversion helpers missing.
- Text/fonts/layout: Font loading path is clear (`FontFactory`), but text layout capabilities lag style surface claims.
- Rendering/performance/profiling: Strong. Debug overlay and render-pass inspector are credible and practical; no pre-0.9 rendering architecture rewrite needed.
- Input/action mapping: Flexible and explicit; no built-in action-map abstraction (intentional), but pad-binding lifecycle and scene/global routing split add friction.
- Audio/live rhythm analysis: Strong baseline. `BeatDetector` + `AudioAnalyser` already support `MediaStream` and `AudioNode` sources and audio-thread worklet processing.
- Particles: Very strong and modern; GPU/CPU routing is coherent and automatic.
- Collision/physics: Detection-first model is clear and useful; full physics remains intentionally out of scope.
- App configuration: Explicit and low magic; common resize/DPR ergonomics could be improved.
- Extras strategy: Debug subpath proves a viable pattern (`./debug` export), but broader extras packaging strategy is not yet explicit.
- Examples/guide friction: Coverage is much improved; a few high-impact mismatches remain.

## 4. Historical delta, identity continuity, and research alignment

### 4.1 Historical roadmap/review delta
- Resolved:
  - Package identity and module-shape concerns from earlier reviews are largely resolved (`package.json` now includes `"type": "module"` and consistent `@codexo/exojs` usage).
  - `Transformable` inheritance concern was resolved by inlining transform ownership into `SceneNode` (`src/core/SceneNode.ts:28-32`).
  - `SceneNode.render` ambiguity is resolved via `RenderNode` abstraction (`src/rendering/RenderNode.ts:78`, `:161`).
  - Mask semantics have moved beyond rectangular-only clipping with explicit `MaskSource` variants (`src/rendering/RenderNode.ts:58`).
- Partially resolved:
  - Root export breadth remains wide (`src/rendering/index.ts`).
  - Docs quality improved heavily (0.8.4 audit), but correctness gaps still exist (scene input consume behavior; manifest shape snippet).
  - Sprite factory side effect remains, but package now explicitly declares side effects (`package.json:16-18`, `src/rendering/sprite/Sprite.ts:308`).
- Still valid:
  - Need explicit stable vs advanced API contract boundaries before 1.0 path hardens.
  - Over-correction risk remains real; broad rewrites are not needed.
- Strategically outdated:
  - Old rectangular-mask concern and Transformable decision as blockers are no longer current truths.
  - Old import-identity inconsistency conclusions are outdated for the current repo state.

### 4.2 Identity continuity and look-and-feel comparison
- What old examples reveal:
  - Strong explicit-draw DNA already existed (`renderManager.clear(); sprite.render(...)`) and scene lifecycle ownership was explicit.
  - Older ergonomics included now-removed transitional APIs (`Scene.create`, `app.inputManager`).
- What current examples improve:
  - Cleaner naming and subsystem boundaries (`app.input`, scene-scoped input registry, structured guide coverage, richer catalog).
  - Better advanced capability coverage (particles GPU path, mesh shaders, render-pipeline debugging, audio-reactive workflows).
- Where code got more complex:
  - Scene stack/input semantics, advanced render composition, and audio analysis are denser and require stronger mental models.
- Where code got cleaner:
  - Core scene/render architecture and identity alignment improved, with fewer legacy seams.
- Whether original ExoJS feel remains intact:
  - Yes. Current ExoJS still feels explicit, pragmatic, and non-magical; complexity growth is mostly capability-driven, not style drift.

### 4.3 Beat-matching research alignment
- Current audio architecture compatibility:
  - Strong. `BeatDetector` already uses `AudioWorklet` and exposes beat-phase/tempo/confidence-style signals and getters.
  - `AudioAnalyser`/`BeatDetector` both accept `MediaStream` and raw `AudioNode`, which keeps microphone/live routing viable.
  - Wasm loading support exists (`WasmFactory`) for advanced pipelines.
- Strategic opportunity or not:
  - Opportunity exists, but it should remain staged. Current APIs are sufficient for incremental live-rhythm evolution without architectural upheaval.
- Architecture/API gaps if pursued:
  - No first-class mic/webcam capture convenience API.
  - No explicit public Worker/WASM bridge utilities for user-defined live-analysis pipelines.
  - These are good extras-layer targets, not mandatory core changes before 0.9.

## 5. Areas that should change before 0.9.0
- Must fix:
  - Correct scene input consume semantics mismatch (`handleInput` true/false behavior).
  - Fix loader manifest guide snippet to match current API.
  - Add explicit guide guidance on sync-only `update`/`draw` semantics.
- Strongly recommended:
  - Add stack-aware scene input binding API to reduce pause/HUD misuse.
  - Add view coordinate helpers (`screenToWorld`, `worldToScreen`).
  - Add minimum text ergonomics (`measure` and basic wrap) or aggressively scope documented guarantees.
  - Tween API polish for chaining ergonomics without breaking existing behavior.
- Opportunistic:
  - Add high-level `Application` resize/DPR option.
  - Publish stable-vs-advanced contract tiers across API docs.

## 6. Areas that should probably remain stable
- Explicit scene-driven draw orchestration (`Scene.draw` as the intentional render boundary).
- Detection-first collision scope in core (not a full physics engine).
- Dual-backend strategy with honest backend-specific capability differences.
- Particle architecture (SoA + optional WebGPU compute path) as a strong differentiator.
- Debug/profiling layer direction (`@codexo/exojs/debug`) with external capture tool alignment.
- Typed loader token model and bundle/manifest concept (improve ergonomics, do not replace the model).

## 7. Wishlist triage
- Tilesets / TileMap / autotiles / Tiled / RPG Maker support:
  - Separate package.
  - Why: high surface area and domain-specific conventions; avoid bloating core.
- Basic physics:
  - Separate package.
  - Why: keep core detection-first identity; offer adapter/world helpers externally.
- WebHID:
  - Extras.
  - Why: device- and platform-fragile API; useful but not core runtime contract.
- WASM support:
  - Core (already present).
  - Why: maintain current loader support; no major expansion needed before 0.9.
- Microphone/webcam input/streams:
  - Extras (with thin core hooks).
  - Why: audio stream ingestion is already possible; capture convenience can be additive outside core.
- Networking:
  - Reject as core; separate package if pursued.
  - Why: outside ExoJS runtime boundary and highly app-specific.
- ExoJS Extras package strategy:
  - Core strategic decision.
  - Why: needed to avoid feature bloat while still shipping common utilities.
- 9-slice scaling:
  - Extras (possible later core candidate).
  - Why: useful UI primitive, but not required to stabilize 0.9.
- Pathfinding:
  - Separate package.
  - Why: algorithmically heavy and game-genre specific.
- 3D meshes:
  - Reject as core.
  - Why: identity drift risk; ExoJS is positioned as a 2D runtime.
- User-facing Compute Shaders:
  - Defer.
  - Why: current raw WebGPU backend escape hatch is enough for advanced users pre-0.9.
- Extended Application Options:
  - Core.
  - Why: small additive DX wins (resize/DPR policies) fit core ergonomics goals.
- More profiling tooling / Chrome DevTools integration:
  - Core + docs.
  - Why: existing path is good; incremental instrumentation/docs improvements are low-risk.
- RenderInstructions / RenderGroup-style rendering architecture:
  - Defer.
  - Why: high complexity and churn risk without strong source evidence of current bottlenecks.
- Richer Playground examples / minigames / improved assets / lighting showcase:
  - Core product priority (content), not core runtime API.
  - Why: highest user-visible ROI for adoption and learning.

## 8. Boilerplate and DX friction found in guide/examples
- Repeated asset retrieval boilerplate:
  - `new Sprite(loader.get(Texture, 'hero'))` appears throughout Guide/examples.
- Manual pointer-to-world conversion boilerplate:
  - repeated clip-space math + inverse matrix access.
- Scene-stack input gating boilerplate:
  - pause/HUD patterns require explicit manual gating because global scene bindings bypass stack-level routing.
- Gamepad lifecycle boilerplate:
  - manual per-pad binding arrays and explicit `unbind()` loops in scene lifecycle.
- Resize/DPR boilerplate:
  - repeated `window.resize` listener + manual CSS size + `app.resize(...)` math.
- Tween chain boilerplate:
  - multiple local refs and explicit `start()` on first tween due return semantics of `chain()`.

## 9. Proposed roadmap
- Remaining 0.8.x work:
  - Fix scene input consume behavior.
  - Correct manifest docs and add snippet-validation checks for guide code.
  - Clarify sync semantics for frame hooks.
  - Ship at least one high-ROI additive helper (`View.screenToWorld` or stack-aware input bindings).
- 0.9.0 breaking/API cleanup work:
  - If behavior compatibility risk is too high for patch, land input consume fix as the intentional 0.9 behavior break.
  - Publish API stability tiers (stable/advanced/internal) and align docs accordingly.
  - Keep breaking scope tight; avoid broad architecture rewrites.
- Post-0.9.0 work:
  - Launch Extras strategy with focused packages (collision world helpers, tilemap/pathfinding candidates, capture helpers).
  - Expand text/layout capabilities beyond minimal wrap/measure.
  - Invest in richer showcase/minigame examples and stronger assets.
- Sequencing and dependencies:
  - First correctness (input contract), then docs contract lock, then additive ergonomics.
  - Defer heavy feature expansions until contract clarity and examples migration are stable.

## 10. Risks / tradeoffs
- API churn:
  - Fixing semantic mismatches late can still break user expectations; delaying makes it worse.
- Core bloat:
  - Pulling tilemap/physics/pathfinding/networking into core would dilute ExoJS' focused identity.
- Overfitting to speculative features:
  - Large render architecture rewrites without measured bottlenecks risk regressions.
- Implementation complexity:
  - Adding skew, full text shaping, and generalized compute abstractions together would overload pre-0.9 scope.
- Docs/examples migration cost:
  - Any behavior change in scene input semantics requires synchronized Guide/example updates.
- Risk of delaying user-visible wins too long:
  - Shipping no ergonomic helpers while waiting for bigger milestones reduces adoption momentum.
- Risk of identity drift:
  - 3D-first or engine-bloat direction would undermine current clear 2D runtime positioning.

## 11. Final recommendation
- Investigate next:
  - Scene input routing correctness and stack-aware input ergonomics.
  - Loader/manifest docs contract validation process.
- Build next:
  - Input consume semantics fix.
  - One or two additive DX helpers with broad usage impact (view coordinate conversion, resize/DPR option, stack-aware bindings).
- Defer:
  - Large new domains (tilemaps, pathfinding, physics engine semantics, networking, render-architecture overhauls).
- v0.9.0 pacing:
  - Do not rush immediately; close the must-fix contract issues first, then accelerate 0.9.0 with a narrow, disciplined scope.
