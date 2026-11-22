# Oxc compatibility and timing evidence

## Scope and versions

This evaluation uses Oxfmt 0.79.0, Oxlint 1.94.0 and
oxlint-tsgolint 7.0.2007, with ESLint 10.11.0, typescript-eslint 8.70.1,
TypeScript 6.0.3, Unicorn 76.0.0 and Prettier 3.9.9. The backend version
preserves the workspace's 72-hour minimum release age. A matching native rule
name is a candidate for migration, not proof that its options, diagnostics,
parser, suppressions and TypeScript project are equivalent.

[lint-rule-coverage.csv](lint-rule-coverage.csv) records every one of the 513
active ESLint rule IDs, their exact resolved option variants, native mapping,
and evaluation result. The initial inventory covers 3,353 tracked files:
3,178 in the root lint passes and 175 in the site's ESLint pass. These produce
51 root configuration groups and four site groups. Adding the Oxfmt config
adds one root file without changing the rule inventory. Stylelint remains a
separate, unchanged site check.

Resolve the site configuration in a process whose working directory is the
site. Its Astro accessibility plugin resolves an optional dependency from
`process.cwd()`. Calculating the site's configuration from the repository root
misses 31 active accessibility rules and understates the inventory.

## Formatter

The formatter comparison checked 3,544 supported non-Astro tracked files and
all 87 Astro files. Oxfmt required 15 TypeScript layout changes; each changed
output, when formatted with the original Prettier configuration, reproduced
the original file exactly. All 87 Astro files were already byte-equivalent
using the opt-in Astro formatter and `@astrojs/compiler-rs` 0.5.0. No parser
errors occurred. Package JSON sorting is explicitly disabled and import
sorting remains ESLint's responsibility.

The authored-file gate can therefore use Oxfmt, including Astro. Generators
that call Prettier's JavaScript API retain Prettier 3.9.9 and the shared default
configuration so that their generated-output contract stays deterministic.

One fresh-process `pnpm exec prettier --check .` took 53.04 seconds on the
clean original tree. One fresh-process `pnpm format:check` using Oxfmt took
1.48 seconds after migration. These used already-installed dependencies and a
warm filesystem; they are local observations, not cold-cache or GitHub runner
measurements.

## Linter coverage

The installed Oxlint registry contains 872 rules. Of the 513 active ESLint
rule IDs, 273 map to native implementations, including eight TypeScript rule
aliases implemented by core rules. The other 240 remain on ESLint.

| Rule family                    | Active ESLint IDs | Native candidates |
| ------------------------------ | ----------------: | ----------------: |
| ESLint core                    |                99 |                95 |
| TypeScript ESLint              |                94 |                93 |
| Unicorn                        |               143 |                58 |
| React hooks                    |                16 |                14 |
| Vitest                         |                13 |                13 |
| ESLint React                   |                76 |                 0 |
| Astro, including accessibility |                43 |                 0 |
| Security                       |                11 |                 0 |
| Custom ExoJS rules             |                10 |                 0 |
| Stylistic                      |                 4 |                 0 |
| Import sorting                 |                 2 |                 0 |
| Unused imports                 |                 2 |                 0 |

The native migration utility emitted 253 rules for the root configuration. It
does not prove coverage for every nested configuration or preserve every
option representation. In particular, its JSON serialization turned regular
expressions in `unicorn/filename-case` into empty objects. The experiment
converted those known ASCII regular expressions to their source strings.

Six active rule IDs have option variants that fail the native option schema:
`@typescript-eslint/no-empty-function`, `preserve-caught-error`,
`unicorn/escape-case`, `unicorn/prefer-array-find`,
`unicorn/prefer-array-flat`, and `vitest/no-focused-tests`. Some options may
have translations, but unverified translations must not disable the original
ESLint rule.

Five native implementations are in the nursery category and remain on ESLint:
`no-undef`, `no-useless-assignment`, `no-unreachable-loop`,
`@typescript-eslint/prefer-optional-chain`, and
`@typescript-eslint/no-unnecessary-condition`. Fourteen other native matches
belong to React configuration that stays wholly on ESLint.

### Observed diagnostic differences

Running the unfiltered native candidate configuration over 3,154 root files,
excluding React, produced 20 diagnostics. Original ESLint passes on the same
17 affected files produced zero diagnostics. These seven rules remain on
ESLint; source is not changed merely to silence a replacement implementation.

| Original rule                                        | Native diagnostics |
| ---------------------------------------------------- | -----------------: |
| `no-unsafe-optional-chaining`                        |                  6 |
| `@typescript-eslint/consistent-generic-constructors` |                  1 |
| `@typescript-eslint/consistent-indexed-object-style` |                  1 |
| `unicorn/no-useless-undefined`                       |                  6 |
| `@typescript-eslint/prefer-literal-enum-member`      |                  1 |
| `@typescript-eslint/no-unnecessary-type-assertion`   |                  2 |
| `@typescript-eslint/no-deprecated`                   |                  3 |

The earlier large volume of alias-related findings was not reproduced with
these versions. A source fixture importing `Vector` through `#math/Vector`
resolved without an unsafe-call or unsafe-assignment diagnostic, and both
linters detected a floating built-in promise in the source and a package.

### TypeScript project boundary

The example configuration deliberately uses `tsconfig.examples.json`, with
`@examples/runtime` mapped to the source helper. This probe produces two
`no-floating-promises` findings under ESLint:

```ts
import { startExample } from '@examples/runtime';

startExample({} as never, () => Promise.resolve());
Promise.resolve('leaked');
```

Oxlint's default type-aware discovery reports only the second statement. The
imported promise is missed. Passing `--tsconfig tsconfig.examples.json` did
not repair the type-aware result; that CLI option is documented for import
resolution. Keep every affected named-project file fully on ESLint, including
any additional typed rules enabled there in future. Do not infer correctness
from zero findings in a context with unresolved imported types.

### Suppression and ignored-file boundary

Oxlint accepts ESLint suppression comments. A used suppression and an unused
suppression were checked with real files; both tools honored the used one,
and both detected the unused one when unused-directive reporting was enabled.
The original vendor ignore also excluded an intentionally invalid vendor
fixture.

In a hybrid configuration, however, Oxlint reported 122 false unused directives
for rules whose ownership remained with ESLint. Preserve unused-directive
checking by routing all 60 files containing ESLint directives through full
ESLint. Do not turn off unused-directive validation to obtain a clean run.

## Conservative hybrid experiment

The evaluated split permits 241 native rule IDs on 2,746 files. All 348
named-project example files and all 60 directive-bearing files retain the
entire original ESLint rule set. Unsupported rules and the observed option or
behavior mismatches stay active in residual ESLint on every other file.
The 24 React package files and all 175 site files continue to use their
original complete configurations.

The comparison passes identical explicit file lists to both variants: 2,335
engine files and 819 package files. Each ESLint pass is a fresh Node process
with `--max-old-space-size=4096`, `--max-warnings=0`, JSON diagnostics and no
ESLint cache. The hybrid runs native lint once, then each residual pass once.
It does not follow those passes with another full-rule ESLint run.

| Command portion     | Original | Conservative hybrid |
| ------------------- | -------: | ------------------: |
| Native rules        |        - |              6.09 s |
| ESLint engine pass  | 133.00 s |             70.03 s |
| ESLint package pass |  42.53 s |             34.28 s |
| Total               | 175.53 s |            110.41 s |

All reported steps exited successfully. This initial local comparison is a
37.1% reduction for the timed root scope; React, site, dependency installation,
and configuration generation are outside this timing. It uses warm installed
dependencies and filesystem caches, not a cold-machine or CI claim. Some
inspection work overlapped the initial baseline; repeat measurements are
needed before treating the percentage as a stable runner estimate.

The host's default Node heap limit was 2,240 MiB. The first original engine
pass exhausted that heap and aborted after 85.3 seconds; it is a failed run,
not a timing improvement. The explicit 4,096 MiB limit applies equally to the
successful comparison variants and does not modify the production wrapper.

## Reproducing the rule inventory

Run from a checkout with its own frozen dependency installation. The
inspection command reads the tracked files selected by the existing root
lint passes, or the site's supported source files, and calculates ESLint's
effective configuration for each. It records exact option variants,
TypeScript parser options, config groups, source identity, ignored files and
typed-rule metadata. It never changes a rule or config.

```sh
lint_evidence_dir=$(mktemp -d)
node scripts/ci/lint-rule-inventory.ts --scope root --output "$lint_evidence_dir/root.json"
node scripts/ci/lint-rule-inventory.ts --scope site --output "$lint_evidence_dir/site.json"
```

To repeat the native comparison, install the pinned evaluation versions in
an isolated checkout, export `oxlint --rules --format json`, and compare by
native rule ID after applying the documented TypeScript/core and React-hooks
aliases. Validate every resolved option variant against the installed
`oxlint/configuration_schema.json`. A rule should be offloaded only while the
implementation versions and exact option variants match the validated
inventory. Preserve the full original configuration whenever the file's
parser, TypeScript project, inline configuration or rule options fall outside
that validated scope.

## Primary references

- [Oxc releases](https://github.com/oxc-project/oxc/releases)
- [Oxfmt migration](https://oxc.rs/docs/guide/usage/formatter/migrate-from-prettier)
- [Oxfmt language support](https://oxc.rs/docs/guide/usage/formatter/language-support)
- [Oxlint migration](https://oxc.rs/docs/guide/usage/linter/migrate-from-eslint)
- [Oxlint type-aware linting](https://oxc.rs/docs/guide/usage/linter/type-aware)
- [Oxlint JavaScript plugin limitations](https://oxc.rs/docs/guide/usage/linter/js-plugins)
- [Oxlint directive behavior](https://oxc.rs/docs/guide/usage/linter/ignore-comments)

JavaScript plugins are currently experimental and do not support type-aware
ESLint plugins or custom parsers. The evaluation therefore retains all custom
ExoJS, security, typed React and Astro rules on ESLint instead of treating
plugin loading as proof of compatible execution.
