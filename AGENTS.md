# ExoJS agent instructions

## Project

ExoJS is a TypeScript-first browser 2D runtime for games and interactive apps.

Core (`@codexo/exojs`) lives at the repository root. Official extensions,
integrations, tooling, and benchmarks live under `packages/`.

Preserve package boundaries and keep Core independent from optional extensions.

## Working context

Inspect the code and tests relevant to the task first. Do not read large
repository documents by default.

Use `CONTRIBUTING.md` when a task touches repository conventions such as imports,
package boundaries, distribution, build constants, or public API conventions.
Read package-local documentation when working inside that package.

`.workspace/` is private working context, not repository authority. Plans,
research, reviews, and temporary design artifacts belong there by default.
Agents may use relevant files there as context, but they are not part of the
repository, public architecture, or API contract. Never reference them from
committed source, tests, documentation, or generated public artifacts. Do not
commit `.workspace/` content unless explicitly requested.

If a decision becomes a durable public or architectural contract, promote the
relevant conclusion to an appropriate tracked repository document rather than
referencing `.workspace/` from source.

## Architecture and package boundaries

- Keep Core independent from official extension packages.
- Cross-package dependencies use public package entry points.
- Follow the repository import policy in `CONTRIBUTING.md`; do not reach into
  another package's private source.
- Keep extensions opt-in and side-effect-free unless an existing contract
  explicitly requires otherwise.
- Do not introduce global registries or hidden cross-package ownership.
- Treat public exports, runtime behavior, serialized values, and TypeScript
  contracts as API decisions rather than implementation details.

## Public API and developer experience

Optimize public APIs for callers, not internal implementation convenience.

Before changing a public API, consider:

- type inference and discoverability;
- lifecycle and ownership semantics;
- defaults and failure behavior;
- tree-shaking and package boundaries;
- compatibility with existing callers;
- guide/example/API-reference impact.

Do not expose internal machinery merely to make an implementation easier.

## Source comments and API documentation

Prefer self-explanatory code.

Add inline comments only for non-obvious correctness or safety requirements,
invariants, lifecycle/ordering constraints, compatibility workarounds, or
intentional deviations from normal practice. Explain why the obvious
implementation would be wrong, not what the code visibly does.

Treat JSDoc as concise user-facing API documentation. Write from the caller's
perspective in neutral prose suitable for direct reuse in an API reference or
developer guide. Document only behavior, contracts, constraints, important
side effects, ownership/lifetime rules, and non-obvious edge cases callers need
to know.

Do not restate names, types, signatures, return types, or obvious behavior.
Internal implementation commentary should be minimal even when JSDoc syntax is
used for tooling.

Never put development provenance in source comments or API documentation:
tasks, commits, issues/PRs, branches/worktrees, conversation or agent history,
private workspace references, or machine-specific paths. Preserve durable
technical rationale only.

Developer-facing source documentation is English and uses ASCII punctuation;
non-ASCII characters are allowed only when technically meaningful. "ASCII
punctuation" means the typographic variants are out - em dash, en dash, curly
quotes, ellipsis - and nothing beyond that. Three kinds of non-ASCII character
are meaningful here and stay:

- **Mathematical and physical notation.** An engine documents forces, angles,
  integration steps and tolerances, and the conventional symbol reads better
  than a spelled-out name: `ω`, `θ`, `Δt`, `μ`, `ε`, `σ`, `π`, `∑`, `√`, `≤`,
  `≥`, `≈`, `≠`, `∞`, `∂`, `∇`, `×`, `·`, `°`. Write `ω = Δθ / Δt`, not
  `omega = delta-theta over delta-t`. Units keep their symbols: `µs`, `m/s²`,
  `rad/s`. Use the notation the domain uses; do not invent a symbol where the
  physics actually says a word.
- **Letters carrying diacritics, in any language.** These are letters, not
  punctuation, and are never transliterated: `Bézier`, `Möller-Trumbore`, a
  contributor's name, a cited paper title. Never `Bezier`, never `Moeller`.
- **Localized user-facing strings**, which this rule does not reach at all.

Identifiers are the exception in the other direction. File names, exported
symbols, type parameters, CSS class names and CLI flags stay ASCII, because
imports and tooling depend on it: the variable is `angularVelocity`, and `ω`
belongs in the doc comment that explains it.

### Language of user-facing content

`site/` is configured for `en` and `de` with English as the default locale
(`site/astro.config.ts`). English is the source of truth and the fallback for
anything untranslated.

When German lands, the home page and the guides are translated, and they are
written in natural German orthography with ä, ö, ü and ß. `ae`/`oe`/`ue`
spellings are wrong there; they are not a safe fallback.

API documentation and playground example code stay English in every locale. The
symbols they describe are English, and a reader following an example has to type
the identifiers exactly as shown.

## Performance and correctness

Do not optimize speculatively.

For hot rendering, input, audio, scene-graph, or allocation paths, preserve
existing allocation and lifetime constraints and measure changes when
performance is materially affected.

Do not trade correctness or API clarity for an unmeasured optimization.

Keep WebGL2/WebGPU behavior aligned where the feature is expected to support
both backends.

## Tests and validation

During iteration, run the smallest relevant validation:

- affected test files or Vitest project;
- affected package typecheck;
- targeted lint/typecheck where useful.

Do not repeatedly run full-repository verification while iterating.

Before completion, run the relevant targeted checks and `git diff --check`.
Use broader repository gates when the change is cross-cutting, affects shared
contracts, or is ready for integration.

Do not weaken, delete, skip, or baseline a failing test or gate merely to make
the change pass without establishing that the expectation itself is wrong.

## Scope

Keep changes scoped to the requested problem. Local cleanup is appropriate when
necessary for the change or when touching an immediately adjacent violation;
do not turn a bounded task into repository-wide cleanup.

Final reports should be concise: summarize the change, validation performed,
and any remaining limitation.
