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
export type Capability = 'webgl2' | 'webgpu' | 'pointer' | 'keyboard' | 'gamepad' | 'touch' | 'audio' | 'fullscreen' | 'vibration' | 'offscreenCanvas' | 'webWorkers';
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
    capabilities?: Capability[];
    notes?: string[];
    unsupportedNote?: string;
    tags?: string[];
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
    }
    var __EXAMPLE_META__: ExampleRuntimeMeta | null | undefined;
}
/** Corner anchor for example overlays. */
export type OverlayCorner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
/** A single controls-legend entry: which key(s) trigger which action. */
export interface ControlHint {
    keys?: string | string[];
    action?: string;
}
/** Handle returned by {@link mountControls}. */
export interface ControlsHandle {
    element: HTMLElement;
    setStatus(text: string): void;
    setControls(list: ControlHint[]): void;
    setHint(text: string): void;
    dispose(): void;
}
/** A single mounted control (slider/toggle/cycle) with a programmatic setter. */
export interface ControlBinding<T = number> {
    set(value: T): void;
}
/** Handle returned by {@link mountControlPanel}. */
export interface ControlPanelHandle {
    element: HTMLElement;
    addSlider(options: {
        label: string;
        min?: number;
        max?: number;
        step?: number;
        value?: number;
        onChange?: (value: number) => void;
    }): ControlBinding<number>;
    addToggle(options: {
        label: string;
        value?: boolean;
        onChange?: (value: boolean) => void;
    }): ControlBinding<boolean>;
    addCycle(options: {
        label: string;
        options: string[];
        index?: number;
        onChange?: (index: number, value: string) => void;
    }): ControlBinding<number>;
    addButton(options: {
        label: string;
        onClick?: () => void;
    }): {
        element: HTMLButtonElement;
    };
    dispose(): void;
}
/** Options for {@link mountControls}. */
export interface MountControlsOptions {
    title?: string;
    controls?: ControlHint[];
    status?: string;
    hint?: string;
    corner?: OverlayCorner;
}
/** Options for {@link mountControlPanel}. */
export interface MountControlPanelOptions {
    title?: string;
    corner?: OverlayCorner;
}
export declare function getExampleMeta(): ExampleRuntimeMeta;
export declare function supportsWebGpu(): boolean;
export declare function createInfoElement(maxWidth?: string): HTMLElement;
export declare function showInfo(element: HTMLElement, title: string, detail: string, isError?: boolean): void;
export declare function formatErrorMessage(error: unknown): string;
/**
 * Mount a non-blocking on-screen panel with a title, a controls legend, an
 * optional live status line, and an optional hint. Returns a handle to update
 * the status/controls and to remove the panel.
 */
export declare function mountControls(options?: MountControlsOptions): ControlsHandle;
/**
 * Mount a predictable DOM control panel over the canvas - sliders, toggles,
 * cycles, and buttons - so interactive examples expose their parameters in a
 * consistent, discoverable way instead of hand-rolling canvas hit-tests.
 */
export declare function mountControlPanel(options?: MountControlPanelOptions): ControlPanelHandle;
