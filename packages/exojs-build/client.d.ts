// Ambient declarations for the imports the ExoJS build plugins resolve.
//
// Add them to a consumer's program with
// `"compilerOptions": { "types": ["@codexo/exojs-build/client"] }` - the same
// contract `vite/client` uses - so `import source from './effect.frag'` and
// `import source from './x.worklet.ts?worklet'` type-check as `string` without
// the consumer declaring the modules itself.
//
// Only the three shader extensions and the two import queries are declared. A
// shader import carrying a query (`./effect.frag?url`) matches none of these,
// which is correct: the plugin leaves it to the bundler, and the bundler's own
// client types describe what it becomes.

/** A GLSL vertex shader file, loaded as its source text. */
declare module '*.vert' {
  const source: string;
  export default source;
}

/** A GLSL fragment shader file, loaded as its source text. */
declare module '*.frag' {
  const source: string;
  export default source;
}

/** A WGSL shader file, loaded as its source text. */
declare module '*.wgsl' {
  const source: string;
  export default source;
}

// For the two below the query, not the filename, selects the transform, so the
// same file can also be imported as an ordinary module where that is wanted.

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
