// Ambient declarations for module queries only the test tree uses.
//
// `?raw` is Vite's raw-text import. The browser render tests pull real shader
// and renderer sources in as strings (to assert on their text), a query the
// engine's own `src/typings.d.ts` has no reason to declare.
declare module '*?raw' {
  const content: string;
  export default content;
}

// `import.meta.glob` is Vite's build-time directory query. Vite ships the type
// with `vite/client`, but that also pulls in the whole DOM-asset module surface,
// which this program has no use for and which would shadow the narrower `?raw`
// declaration above. Only the eager form the shader suites use is declared.
interface ImportMeta {
  glob<T = unknown>(patterns: string | readonly string[], options: { query?: string; import?: string; eager: true }): Record<string, T>;
}
