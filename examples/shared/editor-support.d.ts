// Shared editor-only declarations loaded as Monaco extra libs.

declare global {
  class Stats {
    readonly dom: HTMLElement;
    begin(): void;
    end(): void;
    showPanel(panel: number): void;
  }

  const GPUBufferUsage: Readonly<{
    readonly COPY_DST: number;
    readonly INDEX: number;
    readonly INDIRECT: number;
    readonly MAP_READ: number;
    readonly MAP_WRITE: number;
    readonly QUERY_RESOLVE: number;
    readonly STORAGE: number;
    readonly UNIFORM: number;
    readonly VERTEX: number;
  }>;
}

// Playground-only augmentation - not shipped with the library.
// Adds a permissive index signature to Scene so that JavaScript examples
// extending Scene (e.g. `new class extends Scene { ... }`) can freely
// read/write dynamic state fields (e.g. this._bunny) without declaring
// them. TypeScript examples should instead extend Scene with a named class
// and declare fields explicitly.
//
// This must merge into the existing class, never redeclare it: an
// `export type Scene = ...` here replaces the class with a type alias, so
// every `class X extends Scene` in the editor fails with ts2693 and drags
// the whole example's typing down with it. An `interface` merges with the
// class's instance side and leaves the value export intact.
declare module '@codexo/exojs' {
  // `any` rather than `unknown`: this shim exists so a JavaScript example can
  // read and write `this._bunny` without declaring it. Under `unknown` every
  // such access would need a cast, which is the friction the shim removes.
  // A `Record` alias cannot merge with the exported class - only an interface
  // can, and that is the whole point of this shim.
  // eslint-disable-next-line @typescript-eslint/consistent-indexed-object-style -- see above
  interface Scene {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- see above
    [key: string]: any;
  }
}

export {};
