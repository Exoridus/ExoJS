// Browser-project test setup: guarantee compile-time build flags exist.
//
// The engine source references the bare `__DEV__`, `__VERSION__`, and
// `__REVISION__` globals (replaced with literals by @rollup/plugin-replace in
// production builds, and by Vite's `define` in tests). Under the `#`
// subpath-imports model some engine modules resolve through
// `package.json#imports` and can be pre-bundled by esbuild's optimizer, which
// does NOT apply Vite's `define` — leaving bare references that throw
// `ReferenceError` in the browser runtime. Installing them as real globals
// makes the bare reference resolve regardless of how the module was bundled.
// Harmless where `define` already replaced them with literal values.
(globalThis as typeof globalThis & { __DEV__?: boolean; __VERSION__?: string; __REVISION__?: string }).__DEV__ ??= true;
(globalThis as typeof globalThis & { __DEV__?: boolean; __VERSION__?: string; __REVISION__?: string }).__VERSION__ ??= '0.0.0';
(globalThis as typeof globalThis & { __DEV__?: boolean; __VERSION__?: string; __REVISION__?: string }).__REVISION__ ??= 'test';
