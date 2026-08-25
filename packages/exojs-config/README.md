# @codexo/exojs-config

Private, **unpublished** shared tooling configuration for the ExoJS monorepo. Not a
runtime dependency of any package — used only by repository and package tooling.

It is consumed **without a build step**: every export is executable ESM JavaScript or
plain JSON, resolved through the pnpm workspace symlink.

## Exports

| Subpath                                     | Contents                                                        |
| ------------------------------------------- | --------------------------------------------------------------- |
| `@codexo/exojs-config/typescript/base.json` | shared compiler baseline                                        |
| `…/typescript/library.json`                 | base + declaration emit (Core)                                  |
| `…/typescript/extension.json`               | library profile for official extensions                         |
| `…/typescript/test.json`                    | base + `allowJs`/no-emit for type-checking tests                |
| `@codexo/exojs-config/eslint`               | `createImportBoundaries()`, `coreInternalDirs`                  |
| `@codexo/exojs-config/prettier`             | shared Prettier options                                         |
| `@codexo/exojs-config/vitest`               | `createJsdomTestProject()`, `srcConditions`, `shaderStubPlugin` |
| `@codexo/exojs-config/rolldown`             | `createExtensionBuildOptions()`                                 |
| `@codexo/exojs-config/package-policy`       | `verifyRuntimePackage()`, `verifyConfigPackage()`               |

## Usage

```jsonc
// a package tsconfig.json
{
  "extends": "@codexo/exojs-config/typescript/extension.json",
  "compilerOptions": {
    /* rootDir, customConditions, paths */
  },
}
```

```ts
// a package rolldown.config.ts
import { createExtensionBuildOptions } from '@codexo/exojs-config/rolldown';
export default createExtensionBuildOptions({ root: import.meta.dirname, sourceCondition: '@codexo/exojs-particles-source' });
```

Declarations are a separate step (`scripts/build-extension.ts` runs a `tsc
--emitDeclarationOnly` pass against the package's own `tsconfig.build.json`), since
Rolldown has no declaration emitter of its own.

The Root composes the shared presets with repository-specific globs (ESLint), the
browser WebGL2/WebGPU projects (Vitest), and release assembly (Rolldown/scripts). Those
repository-specific concerns deliberately stay in the Root, not here.
