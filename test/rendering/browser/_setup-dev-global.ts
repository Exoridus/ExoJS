// Browser-project test setup: guarantee the `__DEV__` build-time flag exists.
//
// The engine source guards dev/diagnostic code behind the bare `__DEV__` global
// (replaced with a literal by the rollup `replace` plugin in production, and by
// Vite's `define` in tests). Under the `#` subpath-imports model some engine
// modules (e.g. `src/core/dev.ts`) resolve through `package.json#imports` and
// can be pre-bundled by esbuild's optimizer, which does NOT apply Vite's
// `define` — leaving a bare `__DEV__` that throws `__DEV__ is not defined` in
// the browser runtime. Installing it as a real global makes the bare reference
// resolve regardless of how the module was bundled. Harmless where `define`
// already replaced `__DEV__` with a literal `true`.
(globalThis as typeof globalThis & { __DEV__?: boolean }).__DEV__ ??= true;
