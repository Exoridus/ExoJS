declare module '*.vert' {
  const content: string;
  export default content;
}

declare module '*.frag' {
  const content: string;
  export default content;
}

declare module '*.wgsl' {
  const content: string;
  export default content;
}

// A real, typed AudioWorklet module (`*.worklet.ts`) bundled and inlined as a
// JS string - the AudioWorklet analogue of the shader declarations above. The
// query, not the filename, selects the transform, so the same file can also be
// imported as an ordinary module where that is wanted. See
// `@codexo/exojs-config/worklet-plugin`.
declare module '*?worklet' {
  const content: string;
  export default content;
}

// The Web Worker counterpart: a `*.worker.ts` module bundled into one
// classic-script-compatible string, ready for `new Blob([source])` →
// `URL.createObjectURL` → `new Worker(url)`. See
// `@codexo/exojs-config/worker-plugin`.
declare module '*?worker' {
  const content: string;
  export default content;
}

declare const __DEV__: boolean;
declare const __VERSION__: string;
declare const __REVISION__: string;
