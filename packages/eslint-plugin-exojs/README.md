# @codexo/eslint-plugin-exojs

ESLint rules for the mistakes ExoJS cannot reject at compile time and will not
report at runtime either: a lifecycle hook made `async` that the frame loop
never awaits, a render pass that second-guesses the `enabled` flag its pipeline
already checked, a `destroy()` override that leaves the base's GPU resources
resident, and a system that is built but never registered.

```bash
npm install --save-dev @codexo/eslint-plugin-exojs
```

No runtime dependencies. No type information: every rule works on the parsed
file alone, so adding this plugin does not put the TypeScript checker in your
lint path.

## Setup

```ts
import { exoRulesConfig } from '@codexo/eslint-plugin-exojs';
import { defineConfig } from 'eslint/config';

export default defineConfig([
  //
  ...exoRulesConfig({ files: ['src/**/*.ts'] }),
]);
```

`exoRulesConfig` registers the plugin under the `exo` prefix and turns on one
tier of rules. Register it by hand instead if you would rather choose rules
individually:

```ts
import { exoPlugin } from '@codexo/eslint-plugin-exojs';

export default [
  {
    files: ['src/**/*.ts'],
    plugins: { exo: exoPlugin },
    rules: { 'exo/no-async-update': 'error' },
  },
];
```

## Tiers

| Tier                    | Rules                                                                                                                 |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `recommended` (default) | `no-async-update`, `no-async-render-hook`, `no-self-enabled-check`, `require-super-destroy`, `no-unregistered-system` |
| `strict`                | everything in `recommended`, plus `no-deprecated-api`                                                                 |

Both tiers set every rule to `error`. The split is about what a rule is for, not
about how much it matters: `recommended` describes code that does not do what it
says, `strict` adds the migration check that reports imports of APIs the engine
has deprecated. Deprecation is opt-in across the ecosystem - `eslint:recommended`
carries no deprecation rule at all - so it is a tier you choose, and when you do,
it fails the build like everything else.

```ts
...exoRulesConfig({ files: ['src/**/*.ts'], tier: 'strict', deprecatedApi });
```

`no-deprecated-api` needs a table of deprecated names, which
`collectDeprecatedExports` builds by reading the `@deprecated` JSDoc tags in the
`@codexo/exojs` declaration files you have installed:

```ts
import { globSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';

import { collectDeprecatedExports } from '@codexo/eslint-plugin-exojs';

const engineDist = dirname(createRequire(import.meta.url).resolve('@codexo/exojs'));
const deprecatedApi = collectDeprecatedExports(globSync('**/*.d.ts', { cwd: engineDist }).map(file => resolve(engineDist, file)));
```

## Rules

### `exo/no-async-update`

Flags `async preUpdate` / `fixedUpdate` / `update` / `draw` / `render` on a
class, a class field or an object literal.

The frame loop calls these synchronously and drops the promise: the work lands a
frame or more later, out of order, and a rejection surfaces as an unhandled
rejection instead of through the application's error pipeline. Start the
asynchronous work in the hook and await it elsewhere.

Matched by name alone, with no check that the object really is a system or a
scene - these five names are distinctive enough that an unrelated `async
fixedUpdate()` does not occur in practice. `load()`, `unload()` and `destroy()`
are genuinely asynchronous or genuinely teardown, and are not in the set. A
computed key (`async ['update']()`) is not checked.

### `exo/no-async-render-hook`

Flags `async execute` in a class that `extends RenderPass`, and `async apply` or
`async getOutputBounds` in a class that `extends Filter`.

Same defect, opposite trade-off: `execute` and `apply` are ordinary words, so
this rule pays for its specificity with the `extends` clause instead of trusting
the name. A pass that returns a promise draws after the frame it belonged to,
into a render target the pool may already have handed to someone else.

Configure other bases with `hooks`:

```ts
rules: { 'exo/no-async-render-hook': ['error', { hooks: { RenderPass: ['execute'], MyEffectBase: ['run'] } }] }
```

Only a literal `extends <Identifier>` is matched, so a subclass that reaches
`RenderPass` through an intermediate class in another file is not seen.

### `exo/no-self-enabled-check`

Flags any read of `this.enabled` inside `execute` of a class that
`extends RenderPass`.

`enabled` is the containing pipeline's decision, not the pass's: the pipeline
skips a disabled pass, and executing a pass directly is meant to run it
regardless. A self-check gives the same flag two authorities and silently
overrides the direct call.

This is a check on the pattern, not the position - a guard on the last line
counts exactly as much as one on the first. Reading `enabled` on another pass
(`child.enabled`) is untouched; that is how a pipeline skips its own children.
Writing `this.enabled = false` is untouched too. Reaching the field through a
destructuring (`const { enabled } = this`) is not seen.

Configure with `baseClasses` and `hook`.

### `exo/require-super-destroy`

Flags a `destroy()` override that never calls `super.destroy()`, in a class
extending one of a configured list of base classes.

GPU lifetime in ExoJS is deterministic and not tied to garbage collection, so
the base's `destroy()` is what actually releases the buffers a render root owns,
unlinks the node from its parent, and raises the flag that makes a second call a
no-op. The call may sit anywhere in the override - the rule looks for it, not
for it being first.

The base list is configuration on purpose: without it the rule would report
every subclass of every base, including the majority whose base has no
`destroy()` at all. It defaults to the ExoJS types that own something a subclass
cannot release for it, exported as `EXO_DESTROY_BASE_CLASSES`. `Scene` is not
among them - its `destroy()` is an empty hook for your own cleanup, and the
scene's engine-owned teardown runs separately.

```ts
rules: { 'exo/require-super-destroy': ['error', { baseClasses: [...EXO_DESTROY_BASE_CLASSES, 'MyEntityBase'] }] }
```

### `exo/no-unregistered-system`

Flags `const system = new SomethingSystem()` when nothing in the file passes it
to `systems.add(...)` and nothing calls a phase on it by hand.

A system does nothing until something drives it, and the symptom is silence
rather than an error.

The rule reports only when it can see the whole life of the binding. If the
binding is exported, returned, passed to a function, or stored on an object,
registration may happen somewhere no single-file check can see, and the rule
stays quiet. System-shaped is a name test (`System$`), not a type test.

Configure with `pattern`, `registry`, `registerMethod` and `lifecycleMethods`.

## License

MIT
