// Ambient declarations for the import queries the ExoJS build plugins resolve.
//
// Add them to a consumer's program with
// `"compilerOptions": { "types": ["@codexo/exojs-build/client"] }` - the same
// contract `vite/client` uses - so `import source from './x.worklet.ts?worklet'`
// type-checks as a `string` without the consumer declaring the module itself.
//
// The query, not the filename, selects the transform, so the same file can also
// be imported as an ordinary module where that is wanted.

/** A `*.worklet.ts` module, bundled and inlined as AudioWorklet source. */
declare module '*?worklet' {
  const source: string;
  export default source;
}

/** A `*.worker.ts` module, bundled and inlined as classic Web Worker source. */
declare module '*?worker' {
  const source: string;
  export default source;
}
