// Ambient declarations for module queries only the test tree uses.
//
// `?raw` is Vite's raw-text import. The browser render tests pull real shader
// and renderer sources in as strings (to assert on their text), a query the
// engine's own `src/typings.d.ts` has no reason to declare.
declare module '*?raw' {
  const content: string;
  export default content;
}
