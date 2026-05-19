# Pre-Cross-Examination Factual Verification

## 1. Scene.handleInput consumption contract

### documented contract
- Source/API doc comments define: `Scene.handleInput(...)` returns `true` to consume/stop propagation, and non-`true` values allow propagation:
  - `src/core/Scene.ts:76-79`
  - `src/core/Scene.ts:260-263`
- Guide docs repeat the same public contract:
  - `site/src/content/guide/core-concepts/scene-lifecycle.mdx:32`
  - `site/src/content/guide/core-concepts/scene-lifecycle.mdx:128`

### runtime behavior
- Runtime currently breaks propagation on `handled === false` (or on input mode `capture`):
  - `src/core/SceneManager.ts:464-467`

### aligned or inverted
- Inverted.
- Public contract says "`true` consumes"; runtime implements "`false` consumes" (for passthrough scenes).

### severity / urgency assessment
- Likely intended behavior is the documented one (`true` consumes), not the current runtime branch:
  - Multiple independent docs/comments agree on `true`.
  - Variable naming (`handled`) semantically matches `true => handled`.
  - Guide examples use `return true` from `handleInput` for consumption (`scene-lifecycle.mdx:120-124`).
- Most likely classification: code bug / semantic drift in runtime routing (possibly influenced by `Signal.dispatch` using `false` as stop, but `Scene.handleInput` docs explicitly use the opposite convention).
- Impact scope:
  - Directly affects scene-stack input propagation when top scene input mode is `passthrough`.
  - `capture` mode always stops regardless, so return value mismatch is masked there.
  - `transparent` scenes skip handling entirely.
- Compatibility risk if corrected:
  - Potentially behavior-breaking for users who discovered and coded against current inverted runtime (`return false` to consume).
  - But this would align runtime with already-published docs and source API comments.
- Test coverage status:
  - Current tests cover input modes (`capture`/`passthrough`/`transparent`) but do not assert `handleInput` return-value semantics (`test/core/scene-manager.test.ts:268-305`).
- Urgency:
  - Yes, high urgency. This is a correctness contract mismatch in a core control path and should be addressed before broader roadmap/cross-examination sequencing.

## 2. Historical architecture factual checks

### 2.1 Transformable ownership
1. Does `SceneNode` currently extend `Transformable`?
- No. `SceneNode` is declared as `export class SceneNode implements Collidable`:
  - `src/core/SceneNode.ts:68`

2. Or was transform ownership inlined / restructured?
- Yes. Transform state is inlined on `SceneNode` (`_transform`, `_position`, `_scale`, `_origin`, dirty flags).
- The file comment explicitly notes prior transform-flag abstraction was inlined during the 0.5.0 hierarchy slice:
  - `src/core/SceneNode.ts:28-31`
- Repository-wide source search shows no active `Transformable` class usage in `src` (only this historical comment).

3. Is DeepSeek's "still open" claim factually correct, partially correct, or wrong?
- Wrong against current source.

### 2.2 SceneNode.render() no-op
1. Does `SceneNode` currently expose a no-op `render()` method?
- No. `SceneNode` has no `render()` method.

2. Or is `render()` only present on `RenderNode` / rendering-specific classes?
- Yes. `RenderNode` extends `SceneNode` and declares abstract `render(backend)`:
  - `src/rendering/RenderNode.ts:78`
  - `src/rendering/RenderNode.ts:161`
- Concrete render methods are on rendering types (e.g., `Container`, `Drawable`).

3. Is DeepSeek's "still open" claim factually correct, partially correct, or wrong?
- Wrong against current source.

## 3. Synthesis-report wording check

- Yes, likely a typo/inconsistency.
- In section 8, the report explicitly says Round 2 adversaries should be DeepSeek and Codex:
  - `docs/reviews/2026-05-api-product-ergonomics-review/cross-review-synthesis-claude.md:382`
- But section 9 later says "Codex and Opus should be the adversaries" while immediately citing DeepSeek-specific rationale:
  - `...cross-review-synthesis-claude.md:463-466`
- Given surrounding context, this line most likely intended "Codex and DeepSeek."

## 4. Final verdict

- Settled facts:
  - `Scene.handleInput` contract is currently inverted between public docs/comments and runtime implementation.
  - `SceneNode extends Transformable` is not true in current source; this historical concern is already resolved.
  - `SceneNode.render()` no-op is not present in current source; render ownership is already on `RenderNode`/rendering subclasses.
  - The "Codex and Opus should be the adversaries" sentence is very likely a wording typo.

- Points that should be removed from cross-examination as factual non-issues:
  - "Transformable ownership still unresolved"
  - "SceneNode.render() no-op still unresolved"

- Point that should be fixed immediately before roadmap work continues:
  - The `Scene.handleInput` consumption-contract mismatch (runtime vs documented contract), with an explicit compatibility/migration note because some users may have adapted to current inverted behavior.
