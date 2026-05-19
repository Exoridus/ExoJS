# ExoJS API Review Cross-Synthesis

**Synthesized by**: Claude Sonnet 4.6  
**Input reports**: deepseek-v4-pro.md · claude-opus.md · codex-xhigh.md  
**Date**: 2026-05-15  
**Purpose**: Compare, adjudicate, and design next cross-examination step — not decide the final roadmap

---

## 1. Executive synthesis

### Overall agreement level

Moderate-to-high on identity, high-level architecture, and wishlist exclusions; low-to-moderate on specific pre-0.9.0 priorities; genuine conflict on whether certain historical issues are resolved or open; and one significant finding (scene input semantics) that appears only in Codex and is potentially the most urgent issue in the entire set.

### Most important shared conclusions

1. ExoJS's identity — explicit draw contract, class-based lifecycle, typed resource loading, structural honesty — is intact across the entire 0.8.x cycle.
2. v0.9.0 is close but should not arrive before a targeted cleanup pass. All three reviewers agree on a one-or-two-release buffer.
3. BeatDetector is a genuine category differentiator. No other browser 2D runtime has an equivalent. All three reviewers confirm this independently.
4. Particles, BeatDetector, and the dual-backend architecture all stay in core; tilesets, physics (full), pathfinding, and networking are extras or separate packages.
5. The loader's typed token model is correct and should not be replaced — only supplemented.
6. Scene stacking vocabulary needs named presets at minimum; deeper questions about input routing remain disputed.

### Whether the three reports broadly point toward the same roadmap

Directionally yes, but not in sequence or priority. Codex leads with correctness (fix the bug first); Opus leads with completeness/polish (fill visible gaps); DeepSeek leads with architecture (resolve the structural decisions that were deferred). These three lenses are complementary but produce different priority orderings that cannot be trivially merged without a deciding criterion.

---

## 2. Consensus matrix

| Topic | DeepSeek | Claude Opus | Codex | Agreement | Notes |
|---|---|---|---|---|---|
| ExoJS identity continuity | Preserved and strengthened | Preserved; "same strong idea, much more capable" | Mostly preserved; "higher conceptual density" | **3/3** | Phrasing varies; conclusion identical |
| v0.9.0 timing | One 0.8.x first (0.8.5), then 0.9.0 | Two sprints (0.8.5 + 0.8.6), then 0.9.0-rc | Close but not immediate; correctness first | **3/3** | All reject rushing 0.9.0 |
| Scene stack vocabulary | Single enum OR preset constants | Named preset constants (additive) | Stack-aware input binding API (additive) | **2/3 partial** | DeepSeek+Opus agree on vocabulary fix; Codex addresses routing, not vocabulary |
| Scene input semantics (true/false) | Not raised | Not raised | **Correctness bug — inverted runtime** | **1/3 unique** | Codex only; highest-urgency finding in the set |
| Loader ergonomics | `loader.assets` typed proxy | `Sprite.from(loader, alias)` factory | Typed alias getters + stale docs fix | **2/3 friction** | All agree friction exists; approaches differ significantly |
| SceneNode / Transformable / SceneNode.render | **Still open, must fix** | ✅ **Resolved in 0.5.0** | ✅ **Resolved via RenderNode abstraction** | **CONFLICT** | Factual contradiction; see §6 |
| Signals / runners | Keep as-is; premature to optimize | Document false-return stop; evaluate alternative | Snapshot dispatch safe; no runner rewrite justified | **3/3 stable** | Minor difference: Opus wants documentation fix |
| Fluent `return this` | Remove from scene graph methods | Fix filter methods (addFilter etc.) | Not specifically addressed as standalone item | **1/3 each** | Opus and DeepSeek both flag inconsistency but in different places |
| Tweens | Full subsystem integration (Sprite.tween, View.tween) | Stable; do not add complexity | Fix chain() return semantics (additive) | **Conflict/3-way** | See §6 |
| Text / fonts | `TextLayout.measure` + `Text.ready` | Docs + optional `FontLoader.load` helper | `measure` + basic word-wrap; scope style claims | **2/3 for measure** | DeepSeek + Codex agree on implementation; Opus emphasizes docs |
| Skew transforms | Nice/opportunistic | **Priority 1, one-day win** | Mentioned; not a top priority | **Priority conflict** | Opus rates this far above the other two |
| Blend modes | Opportunistic (add 3 more) | Priority 3 (Overlay, HardLight, Difference) | Not highlighted | **Disagreement on priority** | DeepSeek+Opus agree on content; Opus makes it more urgent |
| Collision / physics | CollisionWorld in Extras; Rapier untouched | Collision response sufficient in Core; Rapier in Extras | Separate package; detection-first in Core | **Partial conflict** | Scope placement varies; see §6 |
| Profiling / RenderGroups | Post-0.9.0 engine evolution | Stabilize existing compute; no rewrite | Defer; current WebGPU escape hatch is enough | **3/3 defer** | Language differs; conclusion identical |
| BeatDetector / live audio | Strategic differentiator; keep in Core | Category differentiator; stabilize before 0.9.0 | Opportunity; staged; no urgency | **3/3 positive** | Agreement on value; WASM/mic expansion deferred by all |
| Core vs Extras strategy | `./debug` subpath as model; extras subpath | `@codexo/exojs-*` namespace | Separate packages for heavy features | **2/3 aligned** | DeepSeek+Opus prefer in-package subpaths; Codex prefers separate packages |
| Examples / assets / minigames | Before 0.9.0; polish descriptions | 1.0 requirement; playground/site priority | Highest user-visible ROI post-0.9.0 | **3/3 high priority** | Sequencing differs slightly |
| Particles staying in Core | Yes — too integrated to split | Yes — keep module architecture | Yes — SoA + GPU path is strong | **3/3** | Full consensus |
| Backend modularization | Do not split WebGL2/WebGPU | Implicit — maintain both | Maintain dual-backend honestly | **3/3** | No report advocates splitting |
| Networking | Separate package or Reject | Out of scope indefinitely | Reject for Core; separate package if ever | **3/3 reject** | Identical conclusion |
| 3D meshes | Reject permanently | Permanently out of scope | Reject — identity drift risk | **3/3 reject** | Identical conclusion |

---

## 3. Strongest consensus conclusions

### C1 — ExoJS identity is intact and should not be redesigned

All three reviewers independently assess the explicit rendering contract, class-based lifecycle, and typed resource model as preserved through the 0.8.x feature cycle. No reviewer advocates structural redesign. The identity documents' claims hold.

**Why it matters:** Prevents "let's reconsider the architecture" from entering the roadmap conversation. The discussion can focus on surface ergonomics, not conceptual direction.

---

### C2 — BeatDetector is a genuine category differentiator

No other browser 2D runtime ships a production-quality, real-time beat tracker. All three reviewers name this explicitly and independently. The `pulse`/`barPulse`/`justBeat`/`subdivisionPhase` derived getters are consistently praised as well-designed.

**Why it matters:** Confirms the investment in BeatDetector was sound. The only open question is how aggressively to market it vs. how much to expand it — but its place in Core is uncontested.

---

### C3 — WASM / microphone expansion is extras/post-0.9.0, not now

Despite the live-audio opportunity, all three reviewers independently recommend deferring WASM FFT acceleration and explicit `getUserMedia` helpers to Extras or post-0.9.0. Current `MediaStream` duck-typing is sufficient for the near term.

**Why it matters:** Prevents BeatDetector enthusiasm from pulling mic/WASM scope into the pre-0.9.0 window.

---

### C4 — Loader friction is real; typed token model must not be replaced

All three identify the repeated `loader.get(Type, alias)` call pattern as a genuine DX friction. All three agree the type-token pattern is a feature, not a bug, and any ergonomic layer must be additive. The three proposed layers differ in approach (see §6), but the agreement on the diagnosis is solid.

**Why it matters:** Gives clear direction: add ergonomic sugar; do not simplify away the type safety.

---

### C5 — Particles, dual backend, and core rendering architecture are stable

No reviewer advocates restructuring the SoA particle system, splitting WebGL2/WebGPU backends, or adding a `RenderInstructions`-style batching layer before 0.9.0. All three classify heavy rendering architecture work as post-0.9.0 evolution.

**Why it matters:** Protects the pre-0.9.0 window from scope creep into the rendering engine.

---

### C6 — Wishlist exclusions are clear: networking rejected, 3D rejected, tilesets/physics/pathfinding are extras/separate

The triage conclusions are highly consistent across all three reviewers. The "never" list and "not Core" list are unambiguous.

**Why it matters:** These are already settled inputs for the roadmap. No further debate needed on any of these classifications.

---

### C7 — Export tiering / API stability documentation should happen before or at 0.9.0

All three reviewers flag the broad root export surface as a pre-1.0 concern, though they differ on urgency (DeepSeek: Must; Codex: Strong; Opus: 0.9.0-rc). The conclusion — that users cannot distinguish stable from advanced from internal API — is consistent.

**Why it matters:** 0.9.0 is the last clean moment to label stability tiers before users start treating everything in the root barrel as stable.

---

## 4. High-value 2-of-3 alignments

### A1 — Scene stacking needs named presets (DeepSeek + Opus; Codex underweights)

DeepSeek and Opus both identify the `mode × input` 9-combination space as a cognitive overhead problem and recommend named preset constants. Codex focuses on a deeper routing/correctness layer and does not address vocabulary ergonomics explicitly.

**Assessment:** The vocabulary fix (presets) and the routing fix (stack-aware binding API) are at different layers. Both are needed. Codex's silence on presets is not disagreement — it is a different focus.

---

### A2 — Text measurement API should be implemented, not just documented (DeepSeek + Codex; Opus underweights)

Both DeepSeek and Codex recommend a `TextLayout.measure` implementation as a concrete deliverable. Codex additionally flags that some style fields are stored but not rendered — a correctness concern, not just a DX wish. Opus recommends documentation of font loading behavior as the fix, without proposing a measurement API.

**Assessment:** Codex's evidence that "wrap/measurement/story is incomplete" and that style claims in docs outpace the implementation gives this more weight than a pure ergonomic preference. The 2/3 consensus for implementation is the right call.

---

### A3 — Blend modes should be expanded (DeepSeek + Opus; Codex silent)

Both DeepSeek and Opus agree on adding Overlay, HardLight, and one or two additional modes. DeepSeek rates it opportunistic; Opus rates it Priority 3. Codex does not raise it.

**Assessment:** Codex's silence likely reflects a tighter focus on correctness issues, not disagreement with the idea. 2/3 favoring expansion is a reasonable basis for inclusion — but priority ranking should follow Codex's correctness-first ordering.

---

### A4 — Scene.root silent blank-screen failure mode should be addressed (Opus + Codex implied; DeepSeek silent)

Opus recommends a dev-mode warning when `root` has children but `render` was never called. Codex flags the same failure mode as part of the "Scene.root documented but still trips users" pattern. DeepSeek does not address it.

**Assessment:** This is an entry-barrier issue with high support cost multiplier as the user base grows. The 2-reviewer signal is enough to include in pre-0.9.0 polish.

---

### A5 — Pre-0.9.0 should deliver exactly one breaking release, not multiple (DeepSeek + Codex; Opus implicit)

Both DeepSeek and Codex argue for a tight, focused 0.9.0 with discipline on breaking scope. DeepSeek advocates "all breaking changes in one release." Codex advocates "correctness first, keep breaking scope tight." Opus's 2-sprint plan implicitly avoids breaking changes in both 0.8.5 and 0.8.6, deferring breakage to 0.9.0.

**Assessment:** Strong implicit consensus. Breaking changes should be batched into 0.9.0, not spread across pre-0.9.0 releases.

---

## 5. Unique but potentially valuable findings

### U1 — Scene input consumption contract is INVERTED at runtime (Codex only)

Codex identifies that `Scene.handleInput` documentation states "return `true` consumes," but the runtime breaks propagation on `handled === false`. Specific evidence is provided: `src/core/Scene.ts:260-263` and `src/core/SceneManager.ts:464-467`.

**Why it may still matter even as a solo finding:** This is a correctness bug in a central control surface (scene stack, pause overlays, modal scenes). If confirmed, it means every implementation of `handleInput` that returns `true` is silently not consuming — or worse, that users worked around the inverted behavior and the "fix" would break them. This is **the highest-urgency finding in the entire review set** and should be treated as an immediate bug investigation, not as a roadmap item.

---

### U2 — `loader.get` error messages need alias + cache-state context (Opus only)

Opus recommends that "I loaded it, why can't I get it?" errors should include the alias and a hint about whether the asset is in the cache under a different key. No other reviewer raises this.

**Why it may still matter:** This is the most common source of loader confusion in typed-token APIs. A single improved error message eliminates a class of support questions.

---

### U3 — Verb naming inconsistency (draw/render) as must-fix (DeepSeek only)

DeepSeek rates the `draw`/`render` inconsistency in the call chain as a "Strong" must-address, citing the chain: `Scene.draw → Container.render → Drawable.render → backend.draw`. Neither Codex nor Opus raises this.

**Why it may still matter:** If the verb inconsistency is real and visible in the public API, it creates genuine reader confusion. But neither Codex nor Opus found it worth flagging after independently reading the same source. This discrepancy warrants adversarial cross-examination.

---

### U4 — AudioManager singleton as architectural inconsistency (DeepSeek only)

DeepSeek identifies that `AudioManager` is a module-level singleton not owned by `Application`, contradicting the pattern where `Application` owns `loader`, `input`, `sceneManager`, and `tweens`. Neither Codex nor Opus raises this.

**Why it may still matter:** If the inconsistency is real, it creates a discoverability problem: users who follow the `app.*` pattern will not find `audio` there, or will find it as an inconsistent accessor. Worth cross-examination.

---

### U5 — View coordinate conversion helpers are missing (Codex only)

Codex identifies that converting between screen and world coordinates requires manual clip-space math from examples, and proposes `View.screenToWorld()` / `View.worldToScreen()` helpers with specific evidence from examples and source. Neither DeepSeek nor Opus raises this.

**Why it may still matter:** Pointer-to-world conversion is near-universal in 2D games with cameras. The evidence is concrete (multiple examples repeat the boilerplate). This is a high-value additive helper regardless of whether other reviewers noticed the gap.

---

### U6 — Async update/draw semantics are sync-only but not explicit in guidance (Codex only)

Codex identifies that `update`/`draw` are synchronous in type and runtime loop, but `async` returns are silently ignored, risking racey frame logic. Evidence: `src/core/Scene.ts:236`, `src/core/SceneManager.ts:238-243`.

**Why it may still matter:** Users who write `async update()` (a natural mistake in an async-heavy TypeScript environment) will get no error and non-deterministic behavior. A dev-time warning is low-cost and prevents a class of invisible bugs.

---

### U7 — `Sprite.from(loader, alias)` factory approach (Opus only)

Opus proposes convenience factory methods on Drawable types rather than a proxy on the loader. This is a different design axis from DeepSeek and Codex — ergonomics delivered at the consumer type rather than the loader.

**Why it may still matter:** It is the least invasive approach to loader friction and preserves the most flexibility. It could be a complementary layer even if DeepSeek's or Codex's approach is also adopted.

---

### U8 — MeshShader WebGPU-first inflection threshold (Opus only)

Opus recommends naming a browser coverage threshold at which the WebGL2 backend becomes a compatibility shim. Neither DeepSeek nor Opus raises this strategic planning question.

**Why it may still matter:** Without a named threshold, the dual-backend maintenance obligation continues indefinitely. Planning the inflection point now avoids a painful future negotiation under pressure.

---

## 6. True conflicts and contradictions

### CONFLICT 1 — `SceneNode extends Transformable` and `SceneNode.render` no-op: open vs. resolved

**Issue:** DeepSeek lists both as "Must before 0.9.0" open issues. Claude Opus and Codex both say they were resolved in the 0.5.0 reset.

| | DeepSeek | Claude Opus | Codex |
|---|---|---|---|
| Transformable | Still open; must convert to owned property | ✅ Done in 0.5.0 ("Inline Transformable into SceneNode") | ✅ Resolved ("inlining transform ownership into SceneNode, `src/core/SceneNode.ts:28-32`") |
| SceneNode.render no-op | Must remove; Opus recommendation never acted on | ✅ Done in 0.5.0 ("Move render() to RenderNode only") | ✅ Resolved ("SceneNode.render ambiguity resolved via RenderNode, `src/rendering/RenderNode.ts:78`") |

**Conflict type:** Factual contradiction.

**Preliminary assessment:** The Codex and Opus positions are almost certainly correct. Codex cites specific source line numbers (`src/core/SceneNode.ts:28-32`, `src/rendering/RenderNode.ts:78, :161`). Opus provides an explicit resolution table. DeepSeek cites the historical Opus review's recommendations as if they are still unexecuted — most likely confusing historical review documents with current source state. This is a misread, not a substantive disagreement.

**Should this go to cross-examination?** No. This is verifiable by reading the source. The factual question can be settled without debate. If the source confirms the Codex/Opus position (which their specific line citations suggest), DeepSeek's Finding #3 and its "Must Fix" table entries for Transformable and SceneNode.render should be marked as already-resolved and removed from open pre-0.9.0 scope.

---

### CONFLICT 2 — Tween direction: three-way disagreement

**Issue:** The three reviewers recommend fundamentally different things for the Tween system.

| | DeepSeek | Claude Opus | Codex |
|---|---|---|---|
| Direction | Full subsystem integration: `Sprite.tween()`, `View.tween()`, `Filter.tween()` — makes Tween feel native to ExoJS types | "Do not add complexity." API is clean and correct. Stable before 0.9.0. | Fix `chain()` return semantics — it returns the next tween, not `this`, creating reference tracking burden. Additive only. |

**Conflict type:** Prioritization + product philosophy.

DeepSeek wants Tween to become a first-class subsystem with entry points on every major type. Opus wants it left alone. Codex identifies a specific ergonomic trap (`chain()` return) without endorsing broader integration.

**Preliminary assessment:** These are genuinely different visions. DeepSeek's integration is appealing but represents new surface area. Opus's "leave it alone" is conservative but may underweight real user friction. Codex's `chain()` fix is the narrowest and safest path. The question is whether the tween system needs to be woven into other types before 0.9.0 or whether that is a post-0.9.0 enhancement.

**Should this go to cross-examination?** Yes — this is one of the clearest scope philosophy disagreements in the set.

---

### CONFLICT 3 — Skew transforms: optional vs. must-ship

**Issue:** All three reviewers acknowledge skew transforms are absent, but assign dramatically different priority.

| | DeepSeek | Claude Opus | Codex |
|---|---|---|---|
| Priority | Opportunistic; "nice-to-have" | **Priority 1 before 0.9.0; one-day implementation; visible gap** | Mentioned; not a top priority |

**Conflict type:** Prioritization difference.

**Preliminary assessment:** Opus's case is strongest: skew is the only missing 2D affine primitive, the implementation path already exists (matrix composition), and the absence is noticed by users from CSS or other 2D frameworks. DeepSeek and Codex do not dispute any of this — they simply prioritize other things higher. This is not a conceptual conflict; it is a ranking conflict that can be resolved by scope-budgeting.

**Should this go to cross-examination?** No. The fact is agreed upon; the priority can be determined by the maintainer's scope judgment.

---

### CONFLICT 4 — Loader ergonomics: which layer to build

**Issue:** Three genuinely different design approaches to the same diagnosed problem.

| | DeepSeek | Claude Opus | Codex |
|---|---|---|---|
| Approach | `loader.assets` proxy — a typed accessor object keyed by manifest-registered aliases | `Sprite.from(loader, alias)` — static factory methods on drawable types | Typed alias getters on loader + immediate stale docs fix | 
| Philosophy | Centralized accessor registry derived from manifest | Consumer-side ergonomics; don't touch loader surface | Loader-side light accessor; prioritize docs correctness first |

**Conflict type:** Product philosophy difference.

All three recognize the same friction. They disagree on where to add the ergonomic layer — at the loader (DeepSeek/Codex) or at the consumer type (Opus). They also disagree on depth — from light getters (Codex) through manifest-generated proxy (DeepSeek).

**Preliminary assessment:** These are not mutually exclusive, but they are not obviously compatible either. A `loader.assets` proxy and `Sprite.from()` would both exist and would serve different use patterns. But "build all three layers" is not a clean answer — it adds surface area. A design decision is needed.

**Should this go to cross-examination?** Yes — this is a real API design question with meaningful roadmap implications.

---

### CONFLICT 5 — Pre-0.9.0 priority order: correctness vs. completeness vs. architecture

**Issue:** The three reviewers produce different ordering for the pre-0.9.0 "must" list.

| | DeepSeek | Claude Opus | Codex |
|---|---|---|---|
| #1 priority | Transformable ownership (may already be resolved) | Skew transforms | Scene input correctness bug |
| #2 | Loader asset access proxy | Filter fluent methods | Loader manifest docs correctness |
| #3 | Export tiering | Blend modes (3 new) | Sync semantics documentation |
| Lens | Architecture-first | Completeness/polish-first | Correctness-first |

**Conflict type:** Prioritization + product philosophy.

**Preliminary assessment:** Codex's correctness-first ordering is the most defensible: fixing a behavior-breaking bug (inverted input semantics) must happen before adding polish features. Opus's completeness lens is appropriate but assumes no correctness bugs exist — a questionable assumption given Codex's finding. DeepSeek's architecture lens operates partially on already-resolved issues.

A synthesis priority order would be: correctness bugs first (Codex) → docs accuracy fixes (Codex) → API completeness (Opus) → ergonomic helpers (all three, different approaches) → architecture decisions (DeepSeek, where not already resolved).

**Should this go to cross-examination?** Yes — this is the most directly roadmap-affecting disagreement and deserves adversarial testing.

---

### CONFLICT 6 — Verb naming (draw/render): must-fix vs. invisible

**Issue:** DeepSeek rates the `draw`/`render` call-chain naming inconsistency as "Strong" pre-0.9.0. Neither Codex nor Opus mentions it.

| | DeepSeek | Claude Opus | Codex |
|---|---|---|---|
| Verb naming | Strong must-address; `Container.render` should be `Container.draw`; two verbs with swapped meanings in public chain | Not raised | Not raised |

**Conflict type:** Prioritization difference (could be a factual question about whether the inconsistency exists in public-facing API).

**Preliminary assessment:** Two out of three reviewers read the same source without flagging this as a concern. Either the inconsistency is less visible than DeepSeek believes, or it exists only in internal/contributor-facing code rather than user-facing API. If `Container.render` and `Drawable.render` are typically called by the engine, not by users, the inconsistency may be real but irrelevant to users. If they appear in user guides and examples, it becomes a meaningful API surface concern.

**Should this go to cross-examination?** Yes — a factual question about API surface visibility with significant breaking-change implications if DeepSeek is right.

---

### CONFLICT 7 — AudioManager singleton: architectural problem vs. non-issue

**Issue:** DeepSeek identifies AudioManager's module-level singleton as an architectural inconsistency. Codex and Opus do not raise it.

| | DeepSeek | Claude Opus | Codex |
|---|---|---|---|
| AudioManager | Singleton accessed via `getAudioManager()` contradicts Application ownership model; should be `app.audio` | Not raised as problem | Not raised |

**Conflict type:** Prioritization difference (possibly a product philosophy difference about singleton patterns).

**Preliminary assessment:** DeepSeek's diagnosis may be correct — if `app.input`, `app.loader`, `app.sceneManager`, `app.tweens` are owned instances and `audio` is a singleton, there is an inconsistency. Whether this inconsistency matters depends on whether users ever want multiple audio contexts (almost never) and whether the `app.audio` getter already exists (unclear from reports). Codex and Opus likely did not raise it because it has no user-visible impact in practice.

**Should this go to cross-examination?** Yes, but it is lower priority than the above five. Include if space allows.

---

## 7. Issues that likely do NOT need further debate

These topics are settled enough to treat as roadmap inputs:

| Topic | Settled conclusion | Basis |
|---|---|---|
| ExoJS identity is intact | Do not redesign; surface polish only | 3/3 |
| BeatDetector stays in Core | Already there; no split | 3/3 |
| Particles stay in Core | Too integrated to separate | 3/3 |
| WASM / mic expansion is post-0.9.0 | Extras or later | 3/3 |
| Networking is out of scope | Reject for Core | 3/3 |
| 3D meshes are out of scope permanently | Identity drift | 3/3 |
| Tilesets are extras/separate package | Not Core | 3/3 |
| Pathfinding is extras/separate package | Not Core | 3/3 |
| RenderInstructions/batching is post-0.9.0 | Internal engine evolution | 3/3 |
| Dual-backend should not be split | Too integrated | 3/3 |
| Loader type-token model should not be replaced | It's a feature; only supplement | 3/3 |
| Scene lifecycle contract is stable | Do not touch | 3/3 |
| Export tiering should happen before or at 0.9.0 | Governance before freeze | 3/3 (urgency differs) |
| Named scene policy presets are needed | At minimum an additive naming layer | 2/3 strong, 1/3 goes deeper |
| Text measurement API should be implemented | Not just documented | 2/3 |
| Blend modes should expand (Overlay + others) | Both DeepSeek and Opus agree | 2/3 |
| Skew transforms should ship before 1.0 | Even if priority varies | 3/3 acknowledge gap |
| Scene.root silent failure needs tighter feedback | Dev-mode warning or docs | 2/3 |
| WebHID is not a Core concern | Extras or defer | 3/3 effectively |
| The `./debug` subpath is the right model for optional tooling | All three validate it | 3/3 |
| Examples/playground/assets are a high priority | Tied to adoption | 3/3 |

---

## 8. Recommended second-round cross-examination set

### Round 2 should have DeepSeek and Codex as the two adversaries. The following five topics are the highest-value disputes.

---

### X1 — Loader ergonomics: which layer, in what order?

**Exact dispute:** DeepSeek proposes a `loader.assets` proxy (manifest-keyed typed accessor object). Codex proposes typed alias getters on the loader plus an immediate stale docs fix. Opus proposes `Sprite.from(loader, alias)` (consumer-side static factory). All three are additive, but they commit different API surface and have different discoverability characteristics.

**Why it matters:** This is the highest daily DX friction point (3/3 agreement on the diagnosis). The wrong choice creates a confusing duplicate API layer. The right choice makes the common case effortless without cluttering advanced use.

**What answer would change in the roadmap:** A decision on which layer (or layers) to ship in 0.8.x vs. 0.9.0, and whether `loader.assets`, `Sprite.from`, and/or typed getters are complementary or redundant.

---

### X2 — Verb naming (draw/render): is this a real user-facing API concern?

**Exact dispute:** DeepSeek rates the `draw`/`render` inconsistency in the call chain as "Strong" pre-0.9.0. Codex and Opus read the same source and did not flag it. The question is whether `Container.render`, `Drawable.render`, and similar are in user-visible guide/example paths or are engine-internal.

**Why it matters:** If the inconsistency is user-visible, it is a meaningful pre-0.9.0 break. If it is engine-internal, a rename is a contributor concern but not a user API concern. The stakes are high either way: a wrong "must rename" would introduce a breaking change for no user-visible benefit; ignoring a real inconsistency would entrench it past 1.0.

**What answer would change in the roadmap:** Whether verb unification is in 0.9.0 (breaking), post-0.9.0 (internal refactor), or off the table.

---

### X3 — Tween direction: integration, chain fix, or stability?

**Exact dispute:** DeepSeek wants `Sprite.tween()`, `View.tween()`, and `Filter.tween()` entry points to make Tween a first-class ExoJS subsystem. Codex wants to fix `chain()` return behavior only (additive). Opus says leave it stable and add no complexity.

**Why it matters:** These three positions are not compatible. If DeepSeek's integration lands, it creates new surface area that Opus explicitly warned against. If Codex's chain fix lands, it is a clean small win without the integration. If nothing changes, an ergonomic trap remains in the chain API.

**What answer would change in the roadmap:** Whether Tween gets integration helpers in 0.9.0, a targeted chain fix in 0.8.x, or neither.

---

### X4 — Pre-0.9.0 scope arbitration: correctness-first vs. completeness-first vs. architecture-first

**Exact dispute:** Codex: fix the input semantics bug and docs errors first. Opus: add skew, blend modes, filter fluency. DeepSeek: resolve architecture items (some of which may already be resolved). These produce non-overlapping top-priority lists.

**Why it matters:** The pre-0.9.0 window has finite capacity. Incorrectly ordering these priorities means either shipping with a correctness bug (Codex's #1 risk) or stalling polish features users will notice (Opus's concern) or deferring architecture work past the last clean break opportunity (DeepSeek's concern).

**What answer would change in the roadmap:** The ordering and batching of 0.8.x vs. 0.9.0 work. Whether correctness fixes must land before ergonomic additions.

---

### X5 — AudioManager singleton: real architectural inconsistency or acceptable pragmatism?

**Exact dispute:** DeepSeek says the `AudioManager` module-level singleton contradicts the `Application` ownership model and should be resolved before 0.9.0. Codex and Opus did not flag this.

**Why it matters:** If it is a real architectural inconsistency, correcting it before 0.9.0 is the right moment — after 1.0 it becomes a source-compatible change with large migration cost. If it is pragmatic and not user-visible, addressing it is unnecessary churn.

**What answer would change in the roadmap:** Whether `Application` should own the audio manager and whether `app.audio` vs. `getAudioManager()` is a 0.9.0 decision.

---

### X6 (lower priority) — Collision response placement: Core utilities vs. Extras package

**Exact dispute:** DeepSeek proposes a lightweight `CollisionWorld` as a Core addition (SceneNode already implements Collidable). Codex recommends detection-first Core + collision utilities only in a separate Extras package. Opus suggests collision response in Core is sufficient alongside Rapier in Extras.

**Why it matters:** If collision response goes in Core, it is a first-class runtime feature and sets expectations. If it stays in Extras, users building physics-adjacent games must compose their own or reach for Rapier. The decision affects scope and bundle size.

**What answer would change in the roadmap:** Whether `CollisionWorld` is a 0.9.x Core addition or an Extras/separate-package development.

---

## 9. Suggested format for the later cross-examination

### Recommended structure: parallel simultaneous critique, then one rebuttal round

**Round 2A (parallel, simultaneous):**
- DeepSeek writes a detailed critique of Codex's pre-0.9.0 priority ordering and loader approach, with specific source references.
- Codex writes a detailed critique of DeepSeek's priority ordering, the factual status of the Transformable/SceneNode.render claims, and the verb naming importance, with specific source references.

Neither should see the other's critique before submitting. This avoids anchoring effects.

**Round 2B (optional rebuttal, after both critiques are submitted):**
- Each reviewer reads the other's critique and writes a single short rebuttal (maximum 500 words each), identifying what they accept, what they reject, and why.

**Why this structure:**

Adversarial critique is most valuable when it is not a dialogue loop — loops tend to converge to the louder voice or the more recent position rather than the better argument. Parallel simultaneous critique forces each reviewer to commit to a position without being influenced by the other's framing. A single rebuttal round then captures genuine reconsiderations without allowing prolonged negotiation.

Codex and Opus should be the adversaries specifically because:
- They disagreed most sharply on what is already resolved (historical architecture)
- They have complementary blind spots (Codex missed blend modes and skew; DeepSeek missed the input semantics bug)
- Their priority orderings are the furthest apart

**Claude Opus should be consulted separately** if a tiebreaker is needed on the Tween direction conflict (it is the only reviewer with a clear "leave it alone" position).

---

## 10. Final takeaway

### Are the three reports converging enough to be useful?

Yes — on architecture, identity, and exclusions, the three reports converge clearly enough to drive decisions without further debate. On ergonomics, the reports are complementary rather than conflicting, with each reviewer surfacing a different layer of user friction. On priority ordering, the reports diverge significantly, which is where the adversarial round will add the most value.

### Critical pre-cross-examination action

**Before any cross-examination or roadmap work proceeds:** Verify the scene input consumption bug identified by Codex (`src/core/Scene.ts:260-263`, `src/core/SceneManager.ts:464-467`). This is not a roadmap discussion item — it is a correctness bug investigation. If confirmed, it lands immediately and unconditionally, regardless of how the rest of the roadmap is ordered. It cannot wait for the cross-examination round.

Similarly: confirm from source whether `SceneNode extends Transformable` and `SceneNode.render` no-op are actually resolved (Codex + Opus: yes; DeepSeek: no). This is a 5-minute source read that removes or reinstates two "Must Fix" items from DeepSeek's list.

### What should happen next

1. **Immediately:** Read `src/core/Scene.ts:260-263` and `src/core/SceneManager.ts:464-467` to verify or refute the input semantics inversion.
2. **Immediately:** Read `src/core/SceneNode.ts:28-32` and `src/rendering/RenderNode.ts:78` to confirm Transformable and SceneNode.render resolution.
3. **After #1-2:** Run the DeepSeek↔Codex adversarial cross-examination on the five priority topics above.
4. **After cross-examination:** Derive the final pre-0.9.0 scope with the benefit of all five rounds of analysis.

The three reviews are high-quality inputs. They do not yet constitute a decision. The cross-examination will sharpen the remaining 20% of questions that matter for the roadmap.
