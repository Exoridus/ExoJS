# @codexo/eslint-plugin-exojs

ESLint rules for the mistakes ExoJS cannot reject at compile time and will not
report at runtime either: a lifecycle hook made `async` that the frame loop
never awaits, and an import of an engine API that has been deprecated.

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

| Tier                    | Rules                                                 |
| ----------------------- | ----------------------------------------------------- |
| `recommended` (default) | `no-async-update`                                     |
| `strict`                | everything in `recommended`, plus `no-deprecated-api` |

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

### `exo/no-deprecated-api`

Flags an import of a name the engine's own JSDoc marks `@deprecated`, with that
tag's replacement note as the message. In the `strict` tier only.

Import specifiers only, matched against the imported name rather than the local
binding, so an aliased import is caught too. A namespace import
(`import * as Exo`) is not tracked.

## License

MIT
