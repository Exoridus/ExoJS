declare module '*.vert' {
  const content: string;
  export default content;
}

declare module '*.frag' {
  const content: string;
  export default content;
}

// A real, typed AudioWorklet module (`*.worklet.ts`) transpiled and inlined as
// a JS string — the AudioWorklet analogue of the two shader declarations
// above. Matches the `?worklet` import query (not the `.worklet.ts` filename)
// so unconverted worklets, still imported without the query, are unaffected.
// See `@codexo/exojs-config/worklet-plugin` for the build/test-side mechanism.
declare module '*?worklet' {
  const content: string;
  export default content;
}

declare const __DEV__: boolean;
declare const __VERSION__: string;
declare const __REVISION__: string;
