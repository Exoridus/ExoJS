import type { LoaderOptions } from '#assets/Loader';
import type { Color } from '#core/Color';
import type { Connectivity } from '#core/Connectivity';
import type { SceneRegistryShape } from '#core/scene/sceneTypes';
import type { CanvasSizing } from '#core/sizing/CanvasSizing';
import type { Extension } from '#extensions/Extension';
import type { GamepadDefinition } from '#input/gamepadDefinitions';
import type { GamepadSlotStrategy } from '#input/InputSystem';
import type { PlatformAdapter } from '#platform/PlatformAdapter';
import type { RenderSurface } from '#platform/RenderSurface';

/**
 * How the finished frame composites against the page behind the canvas.
 *
 * - `'opaque'`: the canvas has no alpha channel. Whatever is behind it in the
 *   document never shows through, no matter what alpha the frame ends on.
 * - `'premultiplied'`: the canvas keeps its alpha channel and the browser
 *   composites the frame over the page with it. Combine with a
 *   {@link ApplicationOptions.clearColor} whose alpha is below `1` to let the
 *   page show through.
 *
 * This is purely about the *browser-side* composite step. It says nothing about
 * how the engine stores or blends colour internally: ExoJS renders premultiplied
 * end to end - textures, render targets and blend modes alike - under both modes.
 */
export type CanvasAlphaMode = 'opaque' | 'premultiplied';

export interface CanvasApplicationOptions {
  /**
   * Existing surface to render into. If omitted, Application creates a canvas
   * element - and a canvas it created is also one it removes from the document
   * again in {@link Application.destroy}. A surface passed in here stays
   * yours: it is left untouched when the application goes down.
   *
   * An `OffscreenCanvas` is accepted and makes the application surface-only:
   * it has no layout box, no styling and no events, so `mount`, `tabIndex` and
   * `imageRendering` do not apply, the document-based sizing policies reject
   * it, and the host has to supply its own
   * {@link ApplicationOptions.platform} affordances for input. See
   * {@link OffscreenPlatform}.
   */
  element?: RenderSurface;
  /**
   * Base (design) resolution in logical pixels, and with it the base aspect
   * ratio. Default: 800.
   *
   * This is the resolution the application is authored against: the logical
   * coordinate system starts here, {@link CanvasApplicationOptions.sizing}
   * measures its resolution caps against it, and it is the size a canvas with
   * no sizing policy keeps for good.
   */
  width?: number;
  /** Base (design) resolution in logical pixels. See {@link CanvasApplicationOptions.width}. Default: 600. */
  height?: number;
  /**
   * Device/render pixel ratio applied to the backing buffer. Default: the
   * host `devicePixelRatio` clamped to `2` (crisp on Retina/HiDPI out of the
   * box, capped so DPR-3 phones don't pay a 9× fill-rate cost), followed for
   * the application's lifetime as the host's ratio changes. Pass an explicit
   * value to override - e.g. `window.devicePixelRatio` for full native
   * density, or `1` to force logical-pixel rendering - which also pins it, so
   * a later host change is ignored.
   */
  pixelRatio?: number;
  /** Canvas tabIndex. Default: -1, preserving current behavior. */
  tabIndex?: number;
  /** CSS image-rendering hint applied to the canvas style. */
  imageRendering?: 'auto' | 'pixelated' | 'crisp-edges';
  /**
   * Element (or CSS selector) to append the canvas to on construction. If
   * omitted, the canvas is created but not mounted - append it yourself.
   */
  mount?: HTMLElement | string;
  /**
   * Strategy that keeps the canvas in step with its surroundings. Omit it for a
   * canvas that stays at `width` × `height` for good, in CSS pixels and in
   * backing-store pixels alike, and observes nothing.
   *
   * The built-in policies -
   * {@link FixedResolutionCanvasSizing}, {@link CappedResolutionCanvasSizing},
   * {@link ResponsiveCanvasSizing} and {@link ManualCanvasSizing} - cover the
   * usual cases; {@link CanvasSizing} is the public base class for anything
   * else. Each instance owns its own observers, so nothing is attached for a
   * policy that tracks nothing.
   *
   * An instance belongs to one application: it is attached here and detached
   * again when {@link Application.sizing} is reassigned or the application is
   * destroyed. The document-based policies need a canvas element with a parent,
   * which for a canvas created by the engine means `mount` has to be given too.
   */
  sizing?: CanvasSizing;
}

export interface RenderingApplicationOptions {
  /**
   * How the canvas composites against the page. Default `'opaque'`. Honoured by
   * both backends: WebGL2 derives the context's `alpha`/`premultipliedAlpha`
   * from it, WebGPU its `GPUCanvasConfiguration.alphaMode`.
   *
   * @see {@link CanvasAlphaMode} for what the two modes do and do not control.
   */
  alphaMode?: CanvasAlphaMode;
  /** WebGL2-only debug wrapper. Ignored by WebGPU. */
  debug?: boolean;
  /**
   * WebGL2 context attributes. Ignored by WebGPU.
   *
   * Merged as **partial overrides on top of ExoJS's own WebGL defaults**
   * (`antialias: false`, `depth: false`, `preserveDrawingBuffer: false`) -
   * passing e.g. `{ antialias: true }` only flips that one attribute and
   * keeps the rest of ExoJS's defaults, it never replaces the whole default
   * set with the browser's own WebGL-spec defaults.
   *
   * Two attributes are not settable here because the engine owns them
   * outright and always overrides whatever is passed:
   * - `alpha` and `premultipliedAlpha` are derived from
   *   {@link RenderingApplicationOptions.alphaMode}, which is the one
   *   spelling of that contract both backends understand.
   * - `stencil` is always forced to `true` - geometric stencil clipping
   *   needs a stencil buffer on the root target unconditionally.
   */
  webglAttributes?: Omit<WebGLContextAttributes, 'alpha' | 'premultipliedAlpha' | 'stencil'>;
  /** WebGL2 sprite renderer batch size. Ignored by WebGPU. */
  spriteRendererBatchSize?: number;
}

export interface InputApplicationOptions {
  gamepadDefinitions?: GamepadDefinition[];
  gamepadSlotStrategy?: GamepadSlotStrategy;
  pointerDistanceThreshold?: number;
  /**
   * Distance in design pixels a press must travel before it turns into a drag
   * on a `draggable` node. Default `8`. Below it the press stays a click, so a
   * draggable node can still be tapped without jittering.
   */
  dragThreshold?: number;
  /**
   * Let the browser show its own context menu over the canvas. Default
   * `false` - a right-click is normally a game input, not a request for the
   * browser's menu. Independent of the engine's own `contextmenu` event,
   * which is routed through the scene graph either way.
   */
  allowNativeContextMenu?: boolean;
  /**
   * Let the browser start a text selection from a drag on the canvas. Default
   * `false` - a drag is normally a game gesture, and a stray selection
   * highlight over the canvas is almost never wanted.
   */
  allowTextSelection?: boolean;
}

export interface ApplicationOptions<Registry extends SceneRegistryShape<Registry> = {}> {
  /**
   * The colour every frame starts from. Applied by the engine's own per-frame
   * clear (see {@link ApplicationOptions.autoClear}) and readable/assignable
   * later as {@link Application.clearColor}. Default: opaque black.
   */
  clearColor?: Color;
  /**
   * Clear the canvas to {@link ApplicationOptions.clearColor} at the start of
   * every frame, before the scene draws. Default `true` - a scene's `draw()`
   * therefore paints onto a fresh frame and needs no clear of its own.
   *
   * Set `false` for pipelines that own the whole frame themselves: feedback /
   * trail effects that deliberately keep the previous frame, or a custom
   * renderer that issues its own clear as part of its first pass. Nothing else
   * changes - {@link Application.clearColor} is still the colour a manual
   * `context.clear(app.clearColor)` would use.
   */
  autoClear?: boolean;
  backend?: BackendConfig;
  canvas?: CanvasApplicationOptions;
  loader?: LoaderOptions;
  rendering?: RenderingApplicationOptions;
  input?: InputApplicationOptions;
  /**
   * Host seam the application runs on - surface focus and geometry, cursor,
   * touch-action, pointer capture, gamepad polling, document visibility, frame
   * scheduling, and input-event delivery. Defaults to a {@link BrowserPlatform}
   * bound to the application's canvas.
   *
   * Pass your own to host the engine somewhere other than a plain DOM canvas,
   * or to drive input and the frame loop from a test without monkey-patching
   * globals. An injected adapter is *not* destroyed by
   * {@link Application.destroy} - it stays yours to dispose.
   */
  platform?: PlatformAdapter;
  /**
   * Whether the application may reach the network, and what the host reports
   * about it. Defaults to one built over {@link ApplicationOptions.platform}.
   *
   * Pass your own when something outside the application needs the same
   * instance - a {@link ConnectivityPolicyResolver} is configured on an
   * `AssetCache` the caller builds, which happens before an `Application`
   * exists to own one. An injected `Connectivity` is *not* destroyed by
   * {@link Application.destroy} - it stays yours to dispose.
   */
  connectivity?: Connectivity;
  /** Seed for the per-Application {@link Application.random} RNG. Omit for a non-deterministic seed. */
  seed?: number;
  /**
   * Print the one-time `ExoJS v{version}` startup banner to the console on
   * {@link Application.start}. Development-only (no-op in production
   * builds) and printed at most once per process regardless of how many
   * `Application`s are constructed. Default `true`.
   */
  hello?: boolean;
  /**
   * Fixed-timestep size in **seconds** for {@link Scene.fixedUpdate} / {@link Application.onFixedFrame}.
   * Default `1 / 60`. Must be positive.
   */
  fixedTimeStep?: number;
  /**
   * Extension selection - the only way an Application is equipped.
   *
   * `undefined` or `[]` → Core only. `[a, b, ...]` → Core plus exactly these.
   *
   * There is no global registry to fall back on: what an application can do is
   * decided here, at its construction, and nowhere else. That is what lets two
   * Applications in one process hold different extension sets - an editor next
   * to its runtime preview, two canvases with different renderers, a test that
   * must not see what a neighbouring test installed.
   *
   * ```ts
   * import { tilemapExtension } from '@codexo/exojs-tilemap';
   *
   * const app = new Application({ extensions: [tilemapExtension] });
   * ```
   *
   * Materialised once at construction.
   */
  extensions?: readonly Extension[];
  /**
   * Registry of navigable {@link Scene} constructors, keyed by a name used
   * for diagnostics (shown in {@link UnregisteredSceneError} messages and
   * duplicate-registration errors) and for key-based navigation. Each value
   * is either a bare {@link Scene} subclass constructor, or a
   * `{ scene, transition? }` descriptor pairing one with a target-bound
   * default transition, consulted by {@link SceneDirector.change}/
   * {@link SceneDirector.restore} whenever navigation targets this
   * constructor without its own call-site `transition` option
   * - see {@link SceneRegistration}. Required for any {@link Application.start} /
   * {@link SceneDirector.change} call that targets a constructor -
   * unregistered targets reject in development builds. Validated once at
   * construction: every value must resolve to a {@link Scene} subclass
   * constructor (checked without instantiating it), and no constructor may
   * appear under more than one key.
   */
  scenes?: Registry;
}

export interface WebGl2BackendConfig {
  type: 'webgl2';
}

export interface WebGpuBackendConfig {
  type: 'webgpu';
}

export interface AutoBackendConfig {
  type: 'auto';
}

export type BackendConfig = AutoBackendConfig | WebGl2BackendConfig | WebGpuBackendConfig;

export const defaultBackendConfig: AutoBackendConfig = { type: 'auto' };
export const defaultCanvasSettings = {
  width: 800,
  height: 600,
  pixelRatio: 1,
  tabIndex: -1,
} as const;
export const defaultLoaderFetchOptions: RequestInit = {
  method: 'GET',
  mode: 'cors',
  cache: 'default',
};
const defaultRenderingSettings: Required<RenderingApplicationOptions> = {
  alphaMode: 'opaque',
  debug: false,
  spriteRendererBatchSize: 4096, // ~ 262kb
  webglAttributes: {
    antialias: false,
    preserveDrawingBuffer: false,
    depth: false,
  },
};
/**
 * Resolve public {@link RenderingApplicationOptions} against ExoJS's own
 * defaults. `webglAttributes` is merged as partial overrides on top of the
 * full default set (see {@link RenderingApplicationOptions.webglAttributes})
 * - everything else is a plain per-field fallback.
 *
 * @internal - shared by the constructor and by tests that need to assert on
 * the resolved options without spinning up a full {@link Application}.
 */
export const resolveRenderingOptions = (renderingOptions: RenderingApplicationOptions): Required<RenderingApplicationOptions> => ({
  alphaMode: renderingOptions.alphaMode ?? defaultRenderingSettings.alphaMode,
  debug: renderingOptions.debug ?? defaultRenderingSettings.debug,
  webglAttributes: { ...defaultRenderingSettings.webglAttributes, ...renderingOptions.webglAttributes },
  spriteRendererBatchSize: renderingOptions.spriteRendererBatchSize ?? defaultRenderingSettings.spriteRendererBatchSize,
});

export const defaultInputSettings: Required<InputApplicationOptions> = {
  gamepadDefinitions: [],
  gamepadSlotStrategy: 'sticky',
  pointerDistanceThreshold: 10,
  dragThreshold: 8,
  allowNativeContextMenu: false,
  allowTextSelection: false,
};
