// Build-time constants: the production builds replace all three identifiers
// with literals. Vitest also defines a `__DEV__` global for esbuild-preoptimised
// modules, so test code can read it without this injection. CONTRIBUTING.md
// documents the values; src/typings.d.ts carries the declarations the test
// environment needs.
declare const __DEV__: boolean;
declare const __VERSION__: string;
declare const __REVISION__: string;
