// Shared editor-only declarations loaded as Monaco extra libs.

type _ExoLoadable = abstract new (...args: Array<any>) => any;

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

// Playground-only augmentation — not shipped with the library.
// Adds a permissive index signature to Scene so that JavaScript examples using
// Scene.create() can freely read/write dynamic state fields (e.g. this._bunny)
// without TypeScript errors. TypeScript examples should instead use a class
// that extends Scene and declares fields explicitly.
declare module "@codexo/exojs" {
    export interface Scene {
        [key: string]: any;
    }

    export abstract class Json {
        private readonly __exoJsonToken: never;
    }
    export abstract class TextAsset {
        private readonly __exoTextToken: never;
    }
    export abstract class SvgAsset {
        private readonly __exoSvgToken: never;
    }
    export abstract class VttAsset {
        private readonly __exoVttToken: never;
    }

    export interface Loader {
        load<T = unknown>(type: typeof Json, path: string, options?: unknown): Promise<T>;
        load<T = unknown>(type: typeof Json, paths: ReadonlyArray<string>, options?: unknown): Promise<Array<T>>;
        load<T = unknown, K extends string = string>(type: typeof Json, items: Readonly<Record<K, string>>, options?: unknown): Promise<Record<K, T>>;
        load(type: typeof TextAsset, path: string, options?: unknown): Promise<string>;
        load(type: typeof TextAsset, paths: ReadonlyArray<string>, options?: unknown): Promise<Array<string>>;
        load<K extends string = string>(type: typeof TextAsset, items: Readonly<Record<K, string>>, options?: unknown): Promise<Record<K, string>>;
        load(type: typeof SvgAsset, path: string, options?: unknown): Promise<HTMLImageElement>;
        load(type: typeof SvgAsset, paths: ReadonlyArray<string>, options?: unknown): Promise<Array<HTMLImageElement>>;
        load<K extends string = string>(type: typeof SvgAsset, items: Readonly<Record<K, string>>, options?: unknown): Promise<Record<K, HTMLImageElement>>;
        load(type: typeof VttAsset, path: string, options?: unknown): Promise<Array<VTTCue>>;
        load(type: typeof VttAsset, paths: ReadonlyArray<string>, options?: unknown): Promise<Array<Array<VTTCue>>>;
        load<K extends string = string>(type: typeof VttAsset, items: Readonly<Record<K, string>>, options?: unknown): Promise<Record<K, Array<VTTCue>>>;
        load<T extends _ExoLoadable>(type: T, path: string, options?: unknown): Promise<InstanceType<T>>;
        load<T extends _ExoLoadable>(type: T, paths: ReadonlyArray<string>, options?: unknown): Promise<Array<InstanceType<T>>>;
        load<T extends _ExoLoadable, K extends string = string>(type: T, items: Readonly<Record<K, string>>, options?: unknown): Promise<Record<K, InstanceType<T>>>;
        get<T = unknown>(type: typeof Json, alias: string): T;
        get(type: typeof TextAsset, alias: string): string;
        get(type: typeof SvgAsset, alias: string): HTMLImageElement;
        get(type: typeof VttAsset, alias: string): Array<VTTCue>;
        get<T extends _ExoLoadable>(type: T, alias: string): InstanceType<T>;
    }
}

declare module "resources/Loader" {
    export interface Loader {
        load<T = unknown>(type: typeof import("@codexo/exojs").Json, path: string, options?: unknown): Promise<T>;
        load<T = unknown>(type: typeof import("@codexo/exojs").Json, paths: ReadonlyArray<string>, options?: unknown): Promise<Array<T>>;
        load<T = unknown, K extends string = string>(type: typeof import("@codexo/exojs").Json, items: Readonly<Record<K, string>>, options?: unknown): Promise<Record<K, T>>;
        load(type: typeof import("@codexo/exojs").TextAsset, path: string, options?: unknown): Promise<string>;
        load(type: typeof import("@codexo/exojs").TextAsset, paths: ReadonlyArray<string>, options?: unknown): Promise<Array<string>>;
        load<K extends string = string>(type: typeof import("@codexo/exojs").TextAsset, items: Readonly<Record<K, string>>, options?: unknown): Promise<Record<K, string>>;
        load(type: typeof import("@codexo/exojs").SvgAsset, path: string, options?: unknown): Promise<HTMLImageElement>;
        load(type: typeof import("@codexo/exojs").SvgAsset, paths: ReadonlyArray<string>, options?: unknown): Promise<Array<HTMLImageElement>>;
        load<K extends string = string>(type: typeof import("@codexo/exojs").SvgAsset, items: Readonly<Record<K, string>>, options?: unknown): Promise<Record<K, HTMLImageElement>>;
        load(type: typeof import("@codexo/exojs").VttAsset, path: string, options?: unknown): Promise<Array<VTTCue>>;
        load(type: typeof import("@codexo/exojs").VttAsset, paths: ReadonlyArray<string>, options?: unknown): Promise<Array<Array<VTTCue>>>;
        load<K extends string = string>(type: typeof import("@codexo/exojs").VttAsset, items: Readonly<Record<K, string>>, options?: unknown): Promise<Record<K, Array<VTTCue>>>;
        load<T extends _ExoLoadable>(type: T, path: string, options?: unknown): Promise<InstanceType<T>>;
        load<T extends _ExoLoadable>(type: T, paths: ReadonlyArray<string>, options?: unknown): Promise<Array<InstanceType<T>>>;
        load<T extends _ExoLoadable, K extends string = string>(type: T, items: Readonly<Record<K, string>>, options?: unknown): Promise<Record<K, InstanceType<T>>>;
        get<T = unknown>(type: typeof import("@codexo/exojs").Json, alias: string): T;
        get(type: typeof import("@codexo/exojs").TextAsset, alias: string): string;
        get(type: typeof import("@codexo/exojs").SvgAsset, alias: string): HTMLImageElement;
        get(type: typeof import("@codexo/exojs").VttAsset, alias: string): Array<VTTCue>;
        get<T extends _ExoLoadable>(type: T, alias: string): InstanceType<T>;
    }
}

export {};
