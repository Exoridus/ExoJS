// Package-local duplicate of the `?worklet` ambient module declaration in the
// root `../../src/typings.d.ts` (mirrors how `packages/exojs-particles/src/typings.d.ts`
// duplicates the `.vert`/`.frag` declarations). `tsc` itself resolves the root
// copy fine via this package's tsconfig `include`, but `@rollup/plugin-typescript`
// glob-scans for ambient declarations independently of that `include` list and
// only finds files inside this package's own `src/` tree — without this local
// copy, its (non-fatal, but noisy) diagnostics pass reports a spurious
// `TS2307: Cannot find module` for the `?worklet` import in BitCrusherEffect.ts.
declare module '*?worklet' {
  const content: string;
  export default content;
}
