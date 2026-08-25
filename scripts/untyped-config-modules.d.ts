// Declaration bridge for the plain-JavaScript modules the tooling imports.
//
// `@codexo/exojs-config` ships ESM `.js` with no declarations: it is consumed
// by ESLint, Prettier and Vitest, which read its exports as data rather than
// through a typed API. `scripts/ci/select-lanes.mjs` is the same shape, and
// `eslint-plugin-security` publishes no types of its own.
//
// These are shorthand ambient declarations, so everything imported from them is
// `any`. That is what crosses the boundary today either way - the difference is
// that stating it keeps `noImplicitAny` on for everything else in
// `tsconfig.scripts.json`, so a genuinely missing annotation in the
// repository's own tooling is still an error rather than silent.
//
// Typing `@codexo/exojs-config` for real would remove this file.

declare module '@codexo/exojs-config/build-defines';
declare module '@codexo/exojs-config/eslint';
declare module '@codexo/exojs-config/eslint/base';
declare module '@codexo/exojs-config/eslint/correctness';
declare module '@codexo/exojs-config/eslint/extension';
declare module '@codexo/exojs-config/eslint/package-test';
declare module '@codexo/exojs-config/eslint/vitest';
declare module '@codexo/exojs-config/package-policy';
declare module '@codexo/exojs-config/prettier';
declare module '@codexo/exojs-config/vitest';
declare module 'eslint-plugin-security';
