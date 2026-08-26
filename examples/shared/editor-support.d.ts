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
declare module '@codexo/exojs' {
  // `any` rather than `unknown`: this shim exists so a JavaScript example can
  // read and write `this._bunny` without declaring it. Under `unknown` every
  // such access would need a cast, which is the friction the shim removes.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- see above
  export type Scene = Record<string, any>;

  export abstract class Json {
    private readonly __exoJsonToken: never;
  }
  export abstract class TextAsset {
    private readonly __exoTextToken: never;
  }
  export abstract class SvgAsset {
    private readonly __exoSvgToken: never;
  }
  export abstract class SubtitleAsset {
    private readonly __exoSubtitleToken: never;
  }
}

export {};
