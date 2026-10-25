import { Button, Panel, type Scene, type UITheme } from '@codexo/exojs';

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
declare global {
    interface Window {
        __EXAMPLE_META__?: ExampleRuntimeMeta | null;
        __EXAMPLE_RENDERER_STATUS__?: ExampleRendererStatus;
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
    fit(app: {
        width: number;
        height: number;
    }, host: HTMLElement): DemoViewport;
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
        /** Readout text for a value; two decimals when omitted. */
        format?: (value: number) => string;
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
    /** Uses the site caption presentation without adding interactive controls. */
    theme?: 'site';
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
export interface ExampleRendererStatus {
    requested: 'unknown' | 'auto' | 'webgl2' | 'webgpu';
    phase: 'requested' | 'initializing' | 'active' | 'fallback' | 'failed';
    actual: 'webgl2' | 'webgpu' | null;
    reason: string | null;
}
interface RendererApplication {
    readonly options: {
        backend?: {
            type?: 'auto' | 'webgl2' | 'webgpu';
        };
    };
    readonly backend: {
        readonly backendType: 'webgl2' | 'webgpu';
    };
    readonly capabilities?: {
        readonly webgpuAdapter: object | null;
    };
    readonly onBackendLost: {
        add(listener: () => void): unknown;
        remove(listener: () => void): unknown;
    };
    readonly onBackendRestored: {
        add(listener: () => void): unknown;
        remove(listener: () => void): unknown;
    };
}
/** Starts a sample while reporting initialized renderer state and retaining the original startup rejection. */
export declare const startExample: (app: RendererApplication, start: () => Promise<unknown>) => Promise<void>;
/** Applies website tokens to native widget skins while preserving their layout and insets. */
export declare const siteUITheme: () => UITheme;
export declare const getExampleMeta: () => ExampleRuntimeMeta;
export declare const supportsWebGpu: () => boolean;
export declare const createInfoElement: (maxWidth?: string) => HTMLElement;
export declare const showInfo: (element: HTMLElement, title: string, detail: string, isError?: boolean) => void;
export declare const formatErrorMessage: (error: unknown) => string;
/**
 * Mount a non-blocking on-screen panel with a title, a controls legend, an
 * optional live status line, and an optional hint. Returns a handle to update
 * the status/controls and to remove the panel.
 */
export declare const mountControls: (options?: MountControlsOptions) => ControlsHandle;
/** Per-pointer record of which button started each press, in press order. */
export interface PressButtonTracker {
    /**
     * Button of the oldest press by `pointerId` not yet taken: 0 for the main
     * button, touch contact or pen contact, 1 auxiliary, 2 secondary. 0 when
     * nothing is recorded, so an unknown press is treated as a main press.
     */
    take(pointerId: number): number;
    dispose(): void;
}
/**
 * Records `PointerEvent.button` for every press on `canvas` at the moment it
 * happens. Engine pointer signals are delivered at the next frame, when
 * `Pointer.buttons` already reads the live state, so a press released before
 * delivery cannot be told apart from a main press there; `take` hands the
 * recorded button back to the signal handler in the order the presses occurred.
 */
export declare const trackPressButtons: (canvas: HTMLCanvasElement) => PressButtonTracker;
/**
 * Mount a predictable DOM control panel over the canvas - sliders, toggles,
 * cycles, and buttons - so interactive examples expose their parameters in a
 * consistent, discoverable way instead of hand-rolling canvas hit-tests.
 */
export declare const mountControlPanel: (options?: MountControlPanelOptions) => ControlPanelHandle;
/** A numeric range control. */
export interface SliderSpec {
    readonly kind: 'slider';
    readonly label: string;
    readonly min: number;
    readonly max: number;
    readonly step: number;
    readonly value: number;
    readonly format?: (value: number) => string;
}
/** An on/off control. */
export interface ToggleSpec {
    readonly kind: 'toggle';
    readonly label: string;
    readonly value: boolean;
}
/** One of a fixed list of named options. */
export interface ChoiceSpec<T extends string = string> {
    readonly kind: 'choice';
    readonly label: string;
    readonly options: readonly T[];
    readonly value: T;
}
export type DemoControlSpec = SliderSpec | ToggleSpec | ChoiceSpec;
/** The value type a control spec holds. */
export type DemoControlValue<S> = S extends SliderSpec ? number : S extends ToggleSpec ? boolean : S extends ChoiceSpec<infer T> ? T : never;
export type DemoPanelValues<C extends Record<string, DemoControlSpec>> = {
    -readonly [K in keyof C]: DemoControlValue<C[K]>;
};
export declare const slider: (label: string, options: {
    min: number;
    max: number;
    value: number;
    step?: number;
    format?: (value: number) => string;
}) => SliderSpec;
export declare const toggle: (label: string, value?: boolean) => ToggleSpec;
export declare const choice: <const T extends string>(label: string, options: readonly T[], value?: T) => ChoiceSpec<T>;
export interface DemoPanelOptions<C extends Record<string, DemoControlSpec>> {
    /** Owns the widgets and their frame subscription. */
    scene: Pick<Scene, 'ui' | 'app' | 'track'>;
    title?: string;
    corner?: OverlayCorner;
    /** A full-width control strip sized in presented CSS pixels. */
    layout?: 'bar';
    /** Instruction hidden in compact presentation. */
    hint?: string;
    controls: C;
    /** Buttons below the controls, in order. */
    actions?: Record<string, () => void>;
    /**
     * Applies a changed value to the scene. Called once with every key on mount,
     * then for each change from a control or from `set`/`step`.
     */
    onChange?: <K extends keyof C>(key: K, value: DemoControlValue<C[K]>, values: Readonly<DemoPanelValues<C>>) => void;
}
/** Presented CSS-pixel dimensions and the scene area left by an overlay. */
export interface DemoViewport {
    readonly scale: number;
    readonly width: number;
    readonly height: number;
    readonly compact: boolean;
    readonly contentHeight: number;
}
export type DemoStatusTone = 'neutral' | 'info' | 'warning' | 'success' | 'error';
/** Handle returned by {@link demoPanel}. */
export interface DemoPanel<C extends Record<string, DemoControlSpec>, Element = Panel> {
    readonly element: Element;
    /** Fits a bar to the presented canvas and reports its available scene area in CSS pixels. */
    fit(app: {
        width: number;
        height: number;
    }, host: HTMLElement): DemoViewport;
    /** Current values; read-only, change them through `set` or `step`. */
    readonly values: Readonly<DemoPanelValues<C>>;
    set<K extends keyof C>(key: K, value: DemoControlValue<C[K]>): void;
    /** Moves a choice by `delta` options (wrapping), a slider by `delta` steps (clamped), or flips a toggle. */
    step(key: keyof C, delta?: number): void;
    /** A short status line under the controls; an empty string hides it. */
    status(text: string, tone?: DemoStatusTone): void;
    dispose(): void;
}
/** Includes the outer preview transform when measuring displayed pixels. Returns 1 while hidden. */
export declare const unitsPerCssPixel: (app: {
    height: number;
}, host: HTMLElement) => number;
/** Crops an explicitly verified one-texel border without changing the shared frame. */
export declare const insetAtlasFrame: <T extends {
    x: number;
    y: number;
    width: number;
    height: number;
    clone(): T;
}>(frame: T) => T;
/**
 * Mounts a small control panel from a declarative control list and keeps one
 * value per control. Keyboard shortcuts should call `set`/`step` so the panel
 * and the shortcut never disagree.
 */
export declare const domDemoPanel: <const C extends Record<string, DemoControlSpec>>(options: Omit<DemoPanelOptions<C>, "scene">) => DemoPanel<C, HTMLElement>;
/** Scene-owned parameter controls with one shared state for widgets and shortcuts. */
export declare const demoPanel: <const C extends Record<string, DemoControlSpec>>(options: DemoPanelOptions<C>) => DemoPanel<C> & {
    readonly actions: Readonly<Record<string, Button>>;
};
export {};
