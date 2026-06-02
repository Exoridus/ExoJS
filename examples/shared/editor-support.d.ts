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
// Adds a permissive index signature to Scene so that JavaScript examples
// extending Scene (e.g. `new class extends Scene { ... }`) can freely
// read/write dynamic state fields (e.g. this._bunny) without declaring
// them. TypeScript examples should instead extend Scene with a named class
// and declare fields explicitly.
declare module '@codexo/exojs' {
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
    export abstract class SubtitleAsset {
        private readonly __exoSubtitleToken: never;
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
        load(type: typeof SubtitleAsset, path: string, options?: unknown): Promise<Array<VTTCue>>;
        load(type: typeof SubtitleAsset, paths: ReadonlyArray<string>, options?: unknown): Promise<Array<Array<VTTCue>>>;
        load<K extends string = string>(type: typeof SubtitleAsset, items: Readonly<Record<K, string>>, options?: unknown): Promise<Record<K, Array<VTTCue>>>;
        load<T extends _ExoLoadable>(type: T, path: string, options?: unknown): Promise<InstanceType<T>>;
        load<T extends _ExoLoadable>(type: T, paths: ReadonlyArray<string>, options?: unknown): Promise<Array<InstanceType<T>>>;
        load<T extends _ExoLoadable, K extends string = string>(
            type: T,
            items: Readonly<Record<K, string>>,
            options?: unknown
        ): Promise<Record<K, InstanceType<T>>>;
        get<T = unknown>(type: typeof Json, alias: string): T;
        get(type: typeof TextAsset, alias: string): string;
        get(type: typeof SvgAsset, alias: string): HTMLImageElement;
        get(type: typeof SubtitleAsset, alias: string): Array<VTTCue>;
        get<T extends _ExoLoadable>(type: T, alias: string): InstanceType<T>;
    }
}

declare module '@assets' {
    export const textures: {
        readonly particleFlame: string; readonly particleSmoke: string; readonly particleStar: string;
        readonly particleSpark: string; readonly particleLight: string; readonly shipA: string;
        readonly pixelWhite: string; readonly pixelBlack: string; readonly pixelTransparent: string;
        readonly checkerboardTransparent: string; readonly kenneyUv: string;
        readonly prototypeDark01: string; readonly prototypeLight01: string; readonly prototypeGrid: string;
    };
    export const sprites: { readonly buttons: { readonly image: string; readonly data: string; }; };
    export const spritesheets: {
        readonly buttons: { readonly image: string; readonly data: string; };
        readonly platformerBackgrounds: { readonly image: string; readonly data: string; };
        readonly platformerCharacters: { readonly image: string; readonly data: string; };
        readonly platformerEnemies: { readonly image: string; readonly data: string; };
        readonly platformerTiles: { readonly image: string; readonly data: string; };
        readonly backgroundElements: { readonly image: string; readonly data: string; };
        readonly mapPack: { readonly image: string; readonly data: string; };
    };
    export const audio: {
        readonly uiClick: string; readonly uiConfirm: string; readonly uiBong: string;
        readonly impactLight: string; readonly impactHeavy: string;
        readonly musicA: string; readonly musicB: string; readonly musicLoop: string;
    };
    export const sound: {
        readonly uiClick: string; readonly uiConfirm: string; readonly uiBong: string;
        readonly back: string; readonly clickAlt: string; readonly switch: string;
        readonly impactLight: string; readonly impactHeavy: string; readonly impactWood: string;
        readonly jump: string; readonly coin: string; readonly hurt: string;
        readonly powerUp: string; readonly laser: string;
    };
    export const music: {
        readonly loopA: string; readonly loopB: string; readonly loopMain: string;
        readonly jingleSuccess: string; readonly jingleFailure: string;
        readonly jingleRetroA: string; readonly jingleRetroB: string;
    };
    export const soundSprites: {
        readonly ui: { readonly audio: string; readonly data: string; };
        readonly impacts: { readonly audio: string; readonly data: string; };
        readonly digital: { readonly audio: string; readonly data: string; };
    };
    export const fonts: {
        readonly kenneyFuture: string; readonly kenneyPixel: string;
        readonly kenneyMini: string; readonly kenneyMiniSquareMono: string;
    };
    export const backgrounds: {
        readonly platformerClouds: string; readonly platformerHills: string;
        readonly castles: string; readonly forest: string;
    };
    export const cursors: {
        readonly arrow: string; readonly pointer: string; readonly hand: string;
        readonly busy: string; readonly cross: string;
    };
    export const svg: {
        readonly play: string; readonly pause: string; readonly reset: string;
        readonly arrowRight: string; readonly sparkle: string; readonly audioWave: string;
        readonly imagePlaceholder: string; readonly runeMark: string;
    };
    export const video: {
        readonly demoLoop: string; readonly highRes: string;
        readonly highFps: string; readonly hdr10: string;
    };
    export const inputPrompts: {
        readonly generic: { readonly image: string; readonly data: string; };
        readonly xboxSeries: { readonly image: string; readonly data: string; };
        readonly playstationSeries: { readonly image: string; readonly data: string; };
        readonly nintendoSwitch: { readonly image: string; readonly data: string; };
        readonly keyboardMouse: { readonly image: string; readonly data: string; };
    };
    export const technical: {
        readonly alpha: { readonly alphaEdgeStraight: string; readonly alphaGradientRings: string; };
        readonly filtering: { readonly checker256: string; readonly pixelGrid128: string; readonly uvGrid256: string; };
        readonly color: { readonly srgbRamp: string; readonly hueRamp: string; readonly primaryRamp: string; };
    };
    export const vendor: { readonly kenneyManifest: string; };
}

declare module 'resources/Loader' {
    export interface Loader {
        load<T = unknown>(type: typeof import('@codexo/exojs').Json, path: string, options?: unknown): Promise<T>;
        load<T = unknown>(type: typeof import('@codexo/exojs').Json, paths: ReadonlyArray<string>, options?: unknown): Promise<Array<T>>;
        load<T = unknown, K extends string = string>(
            type: typeof import('@codexo/exojs').Json,
            items: Readonly<Record<K, string>>,
            options?: unknown
        ): Promise<Record<K, T>>;
        load(type: typeof import('@codexo/exojs').TextAsset, path: string, options?: unknown): Promise<string>;
        load(type: typeof import('@codexo/exojs').TextAsset, paths: ReadonlyArray<string>, options?: unknown): Promise<Array<string>>;
        load<K extends string = string>(
            type: typeof import('@codexo/exojs').TextAsset,
            items: Readonly<Record<K, string>>,
            options?: unknown
        ): Promise<Record<K, string>>;
        load(type: typeof import('@codexo/exojs').SvgAsset, path: string, options?: unknown): Promise<HTMLImageElement>;
        load(type: typeof import('@codexo/exojs').SvgAsset, paths: ReadonlyArray<string>, options?: unknown): Promise<Array<HTMLImageElement>>;
        load<K extends string = string>(
            type: typeof import('@codexo/exojs').SvgAsset,
            items: Readonly<Record<K, string>>,
            options?: unknown
        ): Promise<Record<K, HTMLImageElement>>;
        load(type: typeof import('@codexo/exojs').SubtitleAsset, path: string, options?: unknown): Promise<Array<VTTCue>>;
        load(type: typeof import('@codexo/exojs').SubtitleAsset, paths: ReadonlyArray<string>, options?: unknown): Promise<Array<Array<VTTCue>>>;
        load<K extends string = string>(
            type: typeof import('@codexo/exojs').SubtitleAsset,
            items: Readonly<Record<K, string>>,
            options?: unknown
        ): Promise<Record<K, Array<VTTCue>>>;
        load<T extends _ExoLoadable>(type: T, path: string, options?: unknown): Promise<InstanceType<T>>;
        load<T extends _ExoLoadable>(type: T, paths: ReadonlyArray<string>, options?: unknown): Promise<Array<InstanceType<T>>>;
        load<T extends _ExoLoadable, K extends string = string>(
            type: T,
            items: Readonly<Record<K, string>>,
            options?: unknown
        ): Promise<Record<K, InstanceType<T>>>;
        get<T = unknown>(type: typeof import('@codexo/exojs').Json, alias: string): T;
        get(type: typeof import('@codexo/exojs').TextAsset, alias: string): string;
        get(type: typeof import('@codexo/exojs').SvgAsset, alias: string): HTMLImageElement;
        get(type: typeof import('@codexo/exojs').SubtitleAsset, alias: string): Array<VTTCue>;
        get<T extends _ExoLoadable>(type: T, alias: string): InstanceType<T>;
    }
}

export {};
