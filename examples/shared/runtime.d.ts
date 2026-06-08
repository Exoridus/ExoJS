/**
 * Boolean fields of the engine `Capabilities` object that an example may
 * declare as a hard runtime requirement. Each value here maps 1:1 to a
 * field of `Capabilities` (see `src/core/capabilities.ts`). When any
 * declared capability resolves to `false` at runtime, the playground/guide
 * shows an overlay listing required capabilities and which are missing,
 * and skips mounting the example.
 *
 * Implicit default: every example is assumed to need a working `webgl2`
 * context (the default render backend). Declare `webgl2` only if the
 * example also runs on a WebGPU-only path or the requirement is
 * subsystem-specific. Declare `webgpu` if the example explicitly needs
 * the WebGPU backend (custom shaders, compute, GPU stress).
 */
export type Capability =
    | 'webgl2'
    | 'webgpu'
    | 'pointer'
    | 'keyboard'
    | 'gamepad'
    | 'touch'
    | 'audio'
    | 'fullscreen'
    | 'vibration'
    | 'offscreenCanvas'
    | 'webWorkers';

export interface ExampleRuntimeMeta {
    slug?: string;
    path?: string;
    title?: string;
    description?: string;
    backend?: 'core' | 'webgl2' | 'webgpu' | 'advanced' | string;
    /**
     * Hard runtime requirements. The runner verifies each entry against
     * the resolved engine `Capabilities` instance before mounting the
     * example, and replaces the canvas with an unmet-capabilities overlay
     * if any entry is `false`.
     */
    capabilities?: Array<Capability>;
    notes?: Array<string>;
    unsupportedNote?: string;
    tags?: Array<string>;
    section?: string;
    order?: number;
    status?: string;
}

export interface ExampleRuntime {
    assets: Record<string, unknown>;
    assetUrl?: (path: string) => string;
}

declare global {
    interface Window {
        __EXAMPLE_META__?: ExampleRuntimeMeta | null;
        __EXAMPLE_PREVIEW_AUTOPLAY__?: (() => void | Promise<void>) | null;
        // `assets` is declared (typed) in assets-global.d.ts.
    }
}

declare module '@examples/runtime' {
    export function getExampleMeta(): ExampleRuntimeMeta;
    export function supportsWebGpu(): boolean;
    export function createInfoElement(maxWidth?: string): HTMLElement;
    export function showInfo(element: HTMLElement, title: string, detail: string, isError?: boolean): void;
    export function formatErrorMessage(error: unknown): string;
}

export {};
