# ESLint residual rule rationalization (first-pass triage)

Baseline: ExoJS `next` fe14891ea464, 2026-11-22. Source of truth: [`lint-rule-coverage.csv`](lint-rule-coverage.csv) from the merged PR #1131.

This **does not approve blanket removal** of rules. The inventory reports **513** active rule IDs. **241** have proven limited-scope native ownership and **272** remain with ESLint. These 272 are individually recorded in [`lint-rule-rationalization.csv`](lint-rule-rationalization.csv), including their existing migration reason, configured-file count, recommended review action and an explicit rationale. These are **semantic triage proposals**, not test results or claims of diagnostic equivalence.

## Residual inventory by family

| Family               |   Rules |
| -------------------- | ------: |
| `unicorn`            |      89 |
| `@eslint-react`      |      76 |
| `astro`              |      43 |
| `react-hooks`        |      16 |
| `security`           |      11 |
| `@typescript-eslint` |       9 |
| `exojs`              |       9 |
| `eslint-core`        |       9 |
| `@stylistic`         |       4 |
| `simple-import-sort` |       2 |
| `unused-imports`     |       2 |
| `exojs-engine`       |       1 |
| `vitest`             |       1 |
| **Total**            | **272** |

## First-pass dispositions (baseline classifications)

| Review action                         |   Rules |
| ------------------------------------- | ------: |
| `retain-react-correctness`            |      57 |
| `retain-correctness`                  |      48 |
| `style-value-review`                  |      44 |
| `retain-template-guard`               |      42 |
| `react-overlap-review`                |      18 |
| `legacy-react-relevance-review`       |      17 |
| `native-divergence-review`            |      17 |
| `oxlint-js-plugin-probe`              |      10 |
| `retain-security`                     |       7 |
| `security-scope-review`               |       4 |
| `compiler-or-style-redundancy-review` |       3 |
| `single-owner-review`                 |       2 |
| `retain-or-port`                      |       2 |
| `retain-custom-restriction`           |       1 |
| **Total**                             | **272** |

## What to prune, and what must survive

- **High-confidence audit candidates, not yet deletions:** optional style and modernity preferences; parts of old class-component policy where all configured React code is function-based; overlapping `@eslint-react` vs `react-hooks` diagnostics; old API-specific security checks in projects that do not use those frameworks. Even a rule with zero current warnings may guard against future regressions, so check deliberately invalid fixtures before deletion.
- **Do not drop correctness safeguards:** asynchronous engine-hook guards, missed `super.destroy()`, allocation restrictions, unsafe Promise handling, lifecycle rules, rendering correctness, DOM security, accessibility, unused import protection, and TypeScript/React type-aware rules without verified equivalents.
- **Do not conflate availability with value:** the 240 rules marked `retain: unavailable natively` can potentially use Oxlint's JS plugin API, even when Rust equivalents do not exist. Source-specific parser and TypeScript program behavior must be checked independently.
- **Oxfmt is not Stylelint:** Oxfmt owns formatting. Stylelint remains responsible for SCSS/CSS and Astro `<style>` correctness, custom-property validation and selector rules. Oxlint does not replace CSS/SCSS rule evaluation.

## First policy simplification after triage

The original 513-rule inventory stays as a historical baseline. This branch retires four ESLint-only policies while keeping the native and fallback gates intact:

| Rule                                | Decision | Reason                                                                       |
| ----------------------------------- | -------- | ---------------------------------------------------------------------------- |
| `no-dupe-args`                      | Retire   | Strict ESM syntax already rejects duplicate parameter names                  |
| `no-octal`                          | Retire   | Strict ESM syntax rejects legacy octal literals                              |
| `no-undef-init`                     | Retire   | Style-only, no correctness check removed                                     |
| `astro/prefer-class-list-directive` | Retire   | Authoring preference moved to `site/AGENTS.md`; no correctness check removed |

Node's module parser is exercised by `test/ci/lint-retirement-syntax.test.ts` for the first two. `no-undef-init` and `astro/prefer-class-list-directive` are intentionally retired as style choices, not described as a compiler diagnostic. Regenerate current lint-rule totals after integration; do not rewrite #1131's historical baseline.

**Unicorn is not wholesale disposable:** It contains runtime and performance rules as well as style preferences. For example, `unicorn/no-for-each` currently protects allocation-sensitive code; exceptions for `Map.forEach` in specific hot paths are deliberate. Further retirement needs a rule-by-rule decision.

## Native React shadow pilot

The opt-in `pnpm lint:react:shadow` probes native Oxlint React, React Compiler and JSX accessibility diagnostics over `@codexo/exojs-react` and the site's TSX islands. Its configuration is [`oxlint-react-shadow.json`](oxlint-react-shadow.json), and a focused CLI test includes known failing and clean fixtures.

The React package already has its own ESLint scope, while the site's React islands reuse shared React policy. The intended next step is native Oxlint for both sets of React files, retaining only verified exceptional checks; they must remain subject to equivalent native React diagnostics and intentional imperative-binding exemptions. The shadow pilot is not yet a full replacement.

## Astro: native scripts and community plugin status

Oxlint parses the `<script>` blocks of `.astro` files, **not their full markup templates**. A community Rust/NAPI port, [`oxlint-plugins`](https://github.com/ubugeeei-prod/oxlint-plugins), tracks 7 of 20 `eslint-plugin-astro` rules, including `no-set-html-directive` and `prefer-class-list-directive`. It does **not** implement `astro/valid-compile` and does not solve Astro template parsing or markup accessibility. The community package currently identifies itself as version `0.0.0`; publication and production compatibility remain unverified. [Oxlint's compatibility table](https://oxc.rs/compatibility.html) explicitly states that template linting is not yet supported.

Consequently Astro template linting remains with `eslint-plugin-astro`, Astro's compiler/checker, and the current JSX accessibility rules. Oxfmt continues formatting Astro and Stylelint continues checking CSS/SCSS and Astro `<style>` blocks. An Oxlint Astro script-block pass may be added without disabling template diagnostics; the community port is suitable only for a separate experimental probe until end-to-end parity exists.

## Astro accessibility: no new dependencies

A rule-by-rule inventory is recorded in [`astro-template-rule-audit.csv`](astro-template-rule-audit.csv). The #1131 site baseline included **43 Astro rules**, of which **31** are **generic JSX accessibility rules applied to Astro templates** and **12** concern Astro semantics, deprecations, compilation, or style. This PR removes one style-only rule, leaving **42** Astro rules (31 accessibility, 11 other), with its authoring preference moved to [`site/AGENTS.md`](../../site/AGENTS.md).

Oxlint already implements many `jsx-a11y` rules natively on JSX/TSX. These rules cannot simply be enabled on raw `.astro` HTML: Oxlint's framework parser only checks `<script>` blocks, not Astro markup. Calling this 31-rule overlap "parity" would leave missing `alt`, `label`, and keyboard semantics unguarded. The existing `eslint-plugin-astro` template parser and `jsx-a11y-x` provider are already installed; no extra community plugin is required.

The current `astro check` and Astro build catch compilation and TypeScript errors, and Astro's `Image` component demands `alt`, but a plain HTML `<img>` need not provide `alt` for the compiler to succeed. Therefore compiler gates do **not** replace the static template accessibility rules. Importantly, advice in `AGENTS.md` helps agents author good markup, but is not a deterministic regression gate. It may replace subjective style rules, not high-value accessibility or injection checks.

Review the 4 legacy Astro API rules and `astro/valid-compile` using independently failing fixtures in `astro check` before retiring them. Do not add a new runtime package or build a one-off template parser to force removal of the small remaining ESLint/Astro island. When native Astro template support actually lands, compare complete diagnostics and switch in one scoped change.

## Package and CSS ownership (architecture decision)

Current `next` authored stylesheet inventory: **23 SCSS files, all under `site/src`**; no tracked standalone CSS/SCSS/SASS/LESS stylesheets in the engine, extensions, benchmarks or package scaffolds. Source-level CSS still exists as HTML `<style>` blocks in **six `create-exo-app` templates**, **two benchmark HTML harnesses**, and as DOM/CSS strings in `src/core/devErrorOverlay.ts` and `src/rendering/text/HTMLText.ts`. React's `ExoCanvas.tsx` uses typed inline `style` props. A CSS content-type mapping in the CLI is not a stylesheet.

**Ownership target:**

- `src/` and `packages/exojs-*/`: Oxlint plus native type-aware rules and ExoJS custom rules; TypeScript compiler and existing build/test gates stay independent of the linter
- `packages/exojs-react/`: Oxlint's native React, Hooks and JSX accessibility policy, with explicit, tested exceptions for its imperative React bridge
- `site/`: Oxlint for React/TSX/script code when validated; ESLint only for true Astro-template diagnostics; Stylelint for all authored SCSS/Astro style blocks; Oxfmt for formatting
- `packages/create-exo-app/templates/` and `packages/exojs-bench/`: preserve minimal HTML/inline-CSS validation with existing template, build and smoke tests; do not add a workspace-wide Stylelint dependency just for eight small HTML sources

**One implementation, two front ends:** The existing published `@codexo/eslint-plugin-exojs` package owns all nine public and one engine-internal ESTree rule implementation. Its optional `./oxlint` and `./oxlint-engine` entries added in this PR reuse those implementations; no second plugin package or third-party custom plugin is introduced. The private `@codexo/exojs-config` remains the intended owner of shared repository policy/presets. The `lint:exojs:shadow` command checks the compiled Oxlint entrypoints without changing normal lint ownership. A future neutral package name can be considered if standalone **Oxlint-only npm consumers** need to avoid the legacy ESLint peer and type declarations, but a premature second published package would duplicate maintenance.

**Rollout gate:** Do not remove the root ESLint execution just because Oxlint can load the custom plugin. Existing type-aware context and remaining correctness rules must be accounted for; the new native CLI smoke is opt-in pending red/green parity, repository diagnostics and Windows qualification. No change here implies that all 513 historical rules are safely covered by Oxlint.

## ExoJS plugin adapter

The opt-in `@codexo/eslint-plugin-exojs/oxlint` and `/oxlint-engine` entries reuse the exact existing ESTree-based rules with Oxlint-compatible default exports and explicit `meta.name`. No ExoJS rules are removed, no default lint runner is changed, and no native ownership is transferred in this PR. Unit tests cover export identity and namespace isolation; a real Oxlint CLI smoke checks a representative violation and clean control for each rule against ESLint. This does **not** prove complete semantic parity. Production enablement requires:

1. Compare all ten rules against ESLint on their positive/negative fixtures, including option variants, diagnostic position, errors, directives and TypeScript files.
2. Exercise the plugin through Oxlint's real binary under Node 24 on Linux and Windows; the JS-plugin API remains experimental.
3. Test performance and all reported-failure identities on the full repository, including fallback and external consumer configurations.
4. Only then update `scripts/lint-native-policy.json` and the native ownership planner to admit verified cases. Always retain an ESLint fallback for mismatches and unsupported contexts.

## Gating an actual removal

For every `style-value-review`, `legacy-react-relevance-review`, `react-overlap-review`, and `security-scope-review` candidate, produce a review record proving (a) exact code/config scope, (b) representative red mutation behavior, (c) alternate owner or rationale for intentionally no longer enforcing it, (d) complete actual CI gates, and (e) repository-specific before/after diagnostics and time. Delete only approved entries from the authoritative ESLint presets; update the coverage inventory and this ledger together. Do not delete a rule based on namespace or a zero-finding scan.

### Related evidence

- [Oxc evaluation](OXC_EVALUATION.md): 513-rule inventory, known mismatch findings, TS path alias miss, directive and project-boundary risks.
- [Original coverage CSV](lint-rule-coverage.csv): resolved rule and options.
- [Oxlint JS plugin API](https://oxc.rs/docs/guide/usage/linter/js-plugins): alpha, ESLint-compatible for syntactic ESTree plugins; custom parsers and type-aware JS rules remain unsupported.
