import { Color, createUITheme, defaultUITheme, type UISkinPatch, type UITheme, type UIThemeRole, type UIWidgetState } from '@codexo/exojs';

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

  // Declared on the global scope as well as on `Window`: the runner injects the
  // meta before the example module evaluates, and `getExampleMeta` reads it
  // through `globalThis` so the helper also works where `window` is not the
  // global object.
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
  fit(app: { width: number; height: number }, host: HTMLElement): DemoViewport;
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
  addToggle(options: { label: string; value?: boolean; onChange?: (value: boolean) => void }): ControlBinding<boolean>;
  addCycle(options: {
    label: string;
    options: string[];
    index?: number;
    onChange?: (index: number, value: string) => void;
  }): ControlBinding<number>;
  addButton(options: { label: string; onClick?: () => void }): { element: HTMLButtonElement };
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
  readonly options: { backend?: { type?: 'auto' | 'webgl2' | 'webgpu' } };
  readonly backend: { readonly backendType: 'webgl2' | 'webgpu' };
  readonly capabilities?: { readonly webgpuAdapter: object | null };
  readonly onBackendLost: { add(listener: () => void): unknown; remove(listener: () => void): unknown };
  readonly onBackendRestored: { add(listener: () => void): unknown; remove(listener: () => void): unknown };
}

/** Starts a sample while reporting initialized renderer state and retaining the original startup rejection. */
export const startExample = async (app: RendererApplication, start: () => Promise<unknown>): Promise<void> => {
  const requested = app.options.backend?.type ?? 'auto';
  const attempted = app.backend.backendType;
  let completed = false;
  let lost = false;

  const publish = (phase: ExampleRendererStatus['phase'], actual: ExampleRendererStatus['actual'], reason: string | null = null): void => {
    const status = { requested, phase, actual, reason };
    window.__EXAMPLE_RENDERER_STATUS__ = status;
    window.dispatchEvent(new CustomEvent('exo-renderer-status', { detail: status }));
  };

  const active = (): void => {
    if (!completed || lost) {
      return;
    }

    const actual = app.backend.backendType;
    const fallback = actual !== attempted;
    publish(
      fallback ? 'fallback' : 'active',
      actual,
      fallback
        ? app.capabilities?.webgpuAdapter === null
          ? `No usable WebGPU adapter was detected; auto started ${actual}.`
          : `${attempted} initialization did not succeed; auto started ${actual}. The original cause is not exposed by the engine.`
        : null,
    );
  };

  const onLost = (): void => {
    lost = true;
    publish('failed', null, 'The renderer device or context was lost. Waiting for restoration.');
  };

  const onRestored = (): void => {
    lost = false;
    active();
  };

  publish('requested', null);
  app.onBackendLost.add(onLost);
  app.onBackendRestored.add(onRestored);
  publish('initializing', null);

  try {
    await start();
    completed = true;
    active();
  } catch (error) {
    app.onBackendLost.remove(onLost);
    app.onBackendRestored.remove(onRestored);
    publish('failed', null, formatErrorMessage(error));

    throw error;
  }
};

/** Applies website tokens to native widget skins while preserving their layout and insets. */
export const siteUITheme = (): UITheme => {
  let root = document.documentElement;

  try {
    root = window.parent.document.documentElement;
  } catch {
    /* A detached cross-origin preview uses its own tokens. */
  }

  const tokens = getComputedStyle(root);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1;
  const context = canvas.getContext('2d', { willReadFrequently: true });

  const color = (token: string, fallback: string): Color => {
    if (!context) {
      return Color.fromHex(fallback);
    }

    context.clearRect(0, 0, 1, 1);
    context.fillStyle = tokens.getPropertyValue(token).trim() || fallback;
    context.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = context.getImageData(0, 0, 1, 1).data;

    return new Color(r!, g!, b!, a! / 255);
  };

  const surface = color('--color-surface', '#12181d');
  const raised = color('--color-surface-2', '#191f24');
  const text = color('--color-text', '#eceff2');
  const muted = color('--color-text-muted', '#a8afb5');
  const accent = color('--color-accent', '#88e97e');
  const contrast = color('--color-accent-contrast', '#15351a');
  const patch: Partial<Record<UIThemeRole, Partial<Record<UIWidgetState, UISkinPatch>>>> = {};
  const highlights = new Set(['progressBarFill', 'sliderFill', 'checkboxMark', 'caret', 'selection']);

  for (const role of Object.keys(defaultUITheme) as UIThemeRole[]) {
    const states: Partial<Record<UIWidgetState, UISkinPatch>> = {};

    for (const state of ['normal', 'hover', 'pressed', 'disabled', 'focused'] as UIWidgetState[]) {
      const base = defaultUITheme[role][state] ?? defaultUITheme[role].normal;
      const selected = state === 'pressed' && (role === 'button' || role === 'dropdownItem');
      const foreground = state === 'disabled' || role === 'placeholder' ? muted : selected ? contrast : text;
      states[state] = {
        ...base,
        text: { ...base.text, fontFamily: tokens.getPropertyValue('--f-sans').trim() || 'system-ui', fillColor: foreground },
        background:
          base.background.kind === 'fill'
            ? {
                ...base.background,
                color:
                  selected || highlights.has(role)
                    ? accent
                    : role.endsWith('Knob') || role === 'sliderThumb'
                      ? text
                      : state === 'normal'
                        ? surface
                        : raised,
                borderColor: state === 'focused' ? accent : muted,
                borderWidth: state === 'focused' ? 2 : base.background.borderWidth,
              }
            : base.background,
      };
    }

    patch[role] = states;
  }

  return createUITheme(patch);
};

export const getExampleMeta = (): ExampleRuntimeMeta => {
  const meta = globalThis.__EXAMPLE_META__;

  return meta && typeof meta === 'object' ? meta : {};
};

export const supportsWebGpu = (): boolean => typeof navigator !== 'undefined' && 'gpu' in navigator;

export const createInfoElement = (maxWidth = '430px'): HTMLElement => {
  const element = document.createElement('aside');

  Object.assign(element.style, {
    position: 'fixed',
    top: '16px',
    left: '16px',
    maxWidth,
    padding: '14px 16px',
    borderRadius: '12px',
    background: 'rgba(8, 12, 20, 0.82)',
    border: '1px solid rgba(154, 193, 255, 0.26)',
    color: '#f3f7ff',
    fontFamily: '"Segoe UI", sans-serif',
    fontSize: '13px',
    lineHeight: '1.5',
    boxShadow: '0 12px 32px rgba(0, 0, 0, 0.32)',
    zIndex: '1',
    pointerEvents: 'none',
    whiteSpace: 'normal',
  });

  return element;
};

export const showInfo = (element: HTMLElement, title: string, detail: string, isError = false): void => {
  if (!element.isConnected) {
    document.body.append(element);
  }

  const titleElement = document.createElement('strong');
  const detailElement = document.createElement('span');

  titleElement.textContent = title;
  detailElement.textContent = detail;

  Object.assign(titleElement.style, {
    display: 'block',
    marginBottom: '6px',
    fontSize: '14px',
    color: isError ? '#ffb4b4' : '#ffffff',
  });

  element.replaceChildren(titleElement, detailElement);
};

export const formatErrorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));

// ---------------------------------------------------------------------------
// Example helper kit
//
// Shared overlays and controls so every example presents itself consistently:
// an on-screen title + controls legend (`mountControls`) and predictable DOM
// controls - sliders / toggles / cycles (`mountControlPanel`).
//
// All overlays are fixed-position DOM elements layered over the WebGL canvas, so
// they never interfere with the rendered scene and stay crisp at any DPR.
// ---------------------------------------------------------------------------

const FONT_STACK = '"Segoe UI", system-ui, sans-serif';

const CORNER_STYLES: Record<OverlayCorner, Partial<CSSStyleDeclaration>> = {
  'top-left': { top: '16px', left: '16px' },
  'top-right': { top: '16px', right: '16px' },
  'bottom-left': { bottom: '16px', left: '16px' },
  'bottom-right': { bottom: '16px', right: '16px' },
};

const createPanel = (corner: OverlayCorner = 'top-left'): HTMLElement => {
  const panel = document.createElement('aside');

  Object.assign(panel.style, {
    position: 'fixed',
    padding: '12px 14px',
    borderRadius: '12px',
    background: 'rgba(8, 12, 20, 0.82)',
    border: '1px solid rgba(154, 193, 255, 0.26)',
    color: '#f3f7ff',
    fontFamily: FONT_STACK,
    fontSize: '13px',
    lineHeight: '1.5',
    boxShadow: '0 12px 32px rgba(0, 0, 0, 0.32)',
    zIndex: '4',
    maxWidth: '300px',
    ...(CORNER_STYLES[corner] ?? CORNER_STYLES['top-left']),
  });

  return panel;
};

const createKeyChip = (label: string): HTMLElement => {
  const chip = document.createElement('kbd');

  chip.textContent = label;

  Object.assign(chip.style, {
    display: 'inline-block',
    padding: '1px 7px',
    margin: '0 3px 0 0',
    borderRadius: '6px',
    background: 'rgba(154, 193, 255, 0.16)',
    border: '1px solid rgba(154, 193, 255, 0.32)',
    font: `600 12px ${FONT_STACK}`,
    color: '#dce8ff',
    whiteSpace: 'nowrap',
  });

  return chip;
};

const createControlRow = (control: ControlHint): HTMLElement => {
  const row = document.createElement('div');

  Object.assign(row.style, { display: 'flex', alignItems: 'baseline', gap: '4px', margin: '4px 0' });

  const rawKeys = control.keys ?? [];
  const keys = Array.isArray(rawKeys) ? rawKeys : [rawKeys];
  const keysWrap = document.createElement('span');

  for (const key of keys) {
    keysWrap.append(createKeyChip(String(key)));
  }

  const action = document.createElement('span');

  action.textContent = control.action ?? '';
  action.style.color = '#c4d2ec';

  row.append(keysWrap, action);

  return row;
};

/**
 * Mount a non-blocking on-screen panel with a title, a controls legend, an
 * optional live status line, and an optional hint. Returns a handle to update
 * the status/controls and to remove the panel.
 */
export const mountControls = (options: MountControlsOptions = {}): ControlsHandle => {
  const { title = '', controls = [], status = '', hint = '', corner = 'top-left' } = options;

  const panel = createPanel(corner);
  const disposeTheme = options.theme === 'site' ? styleDemoBar(panel) : undefined;

  if (options.theme === 'site') {
    panel.classList.add('exo-demo-caption');
  }

  const fit = createOverlayFitter(panel, corner, false);
  panel.style.pointerEvents = 'none';

  const titleEl = document.createElement('strong');
  const controlsEl = document.createElement('div');
  const statusEl = document.createElement('div');
  const hintEl = document.createElement('div');

  Object.assign(titleEl.style, { display: 'block', marginBottom: '6px', fontSize: '14px', color: '#ffffff' });
  Object.assign(statusEl.style, { marginTop: '6px', font: `600 13px ${FONT_STACK}`, color: '#9fd0ff' });
  Object.assign(hintEl.style, { marginTop: '6px', fontSize: '12px', color: '#8aa0c4' });

  const renderControls = (list: ControlHint[]) => controlsEl.replaceChildren(...list.map(createControlRow));

  titleEl.textContent = title;
  renderControls(controls);
  statusEl.textContent = status;
  hintEl.textContent = hint;
  statusEl.className = 'exo-demo-status';
  hintEl.className = 'exo-demo-hint';

  panel.append(titleEl, controlsEl, statusEl, hintEl);
  document.body.append(panel);

  return {
    element: panel,
    fit,
    setStatus(text: string) {
      if (statusEl.textContent !== text) {
        statusEl.textContent = text ?? '';
      }
    },
    setControls(list: ControlHint[]) {
      renderControls(list ?? []);
    },
    setHint(text: string) {
      hintEl.textContent = text ?? '';
    },
    dispose() {
      disposeTheme?.();
      panel.remove();
    },
  };
};

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
export const trackPressButtons = (canvas: HTMLCanvasElement): PressButtonTracker => {
  const queues = new Map<number, number[]>();
  const root = canvas.ownerDocument;

  const onDown = (event: Event): void => {
    if (event.target !== canvas) {
      return;
    }

    const { pointerId, button } = event as PointerEvent;
    const queue = queues.get(pointerId);

    if (queue) {
      queue.push(button);
    } else {
      queues.set(pointerId, [button]);
    }
  };

  // The engine listens on the canvas in the capture phase and stops immediate
  // propagation of the presses it handles, so a listener on the canvas itself
  // never sees them; the document's capture phase runs before it.
  root.addEventListener('pointerdown', onDown, { capture: true });

  return {
    take: pointerId => {
      const queue = queues.get(pointerId);
      const button = queue?.shift() ?? 0;

      if (queue?.length === 0) {
        queues.delete(pointerId);
      }

      return button;
    },
    dispose: () => {
      root.removeEventListener('pointerdown', onDown, { capture: true });
      queues.clear();
    },
  };
};

const CONTROL_CLASS = 'exo-example-control';

// Hover, pressed and keyboard-focus states need pseudo-classes, which inline
// styles cannot express, so one shared rule set is injected on first use.
const ensureControlStyles = (): void => {
  if (document.getElementById(`${CONTROL_CLASS}-styles`)) {
    return;
  }

  const style = document.createElement('style');

  style.id = `${CONTROL_CLASS}-styles`;
  style.textContent = `
.${CONTROL_CLASS} { transition: filter 120ms ease; }
.${CONTROL_CLASS}:hover { filter: brightness(1.3); }
.${CONTROL_CLASS}:active { filter: brightness(1.55); }
.${CONTROL_CLASS}:focus-visible { outline: 2px solid #9fd0ff; outline-offset: 2px; }
.${CONTROL_CLASS}:disabled { opacity: 0.45; cursor: not-allowed; filter: none; }
input[type='range'].${CONTROL_CLASS} { accent-color: #7fb8ff; }
@media (prefers-reduced-motion: reduce) { .${CONTROL_CLASS} { transition: none; } }
`;
  document.head.append(style);
};

const createControlRowContainer = (): HTMLElement => {
  const row = document.createElement('div');

  Object.assign(row.style, { display: 'flex', alignItems: 'center', gap: '10px', margin: '6px 0' });

  return row;
};

const createControlLabel = (text: string): HTMLElement => {
  const label = document.createElement('span');

  label.textContent = text;

  Object.assign(label.style, { flex: '0 0 auto', minWidth: '92px', color: '#c4d2ec', fontSize: '12px' });

  return label;
};

/**
 * Mount a predictable DOM control panel over the canvas - sliders, toggles,
 * cycles, and buttons - so interactive examples expose their parameters in a
 * consistent, discoverable way instead of hand-rolling canvas hit-tests.
 */
export const mountControlPanel = (options: MountControlPanelOptions = {}): ControlPanelHandle => {
  const { title = '', corner = 'bottom-left' } = options;

  const panel = createPanel(corner);

  ensureControlStyles();
  panel.style.pointerEvents = 'auto';
  panel.style.minWidth = '230px';

  panel.setAttribute('role', 'group');

  if (title) {
    panel.setAttribute('aria-label', title);
    const titleEl = document.createElement('strong');

    titleEl.textContent = title;
    Object.assign(titleEl.style, { display: 'block', marginBottom: '8px', fontSize: '14px', color: '#ffffff' });
    panel.append(titleEl);
  }

  document.body.append(panel);

  const stop = (event: Event) => event.stopPropagation();

  panel.addEventListener('pointerdown', stop);

  return {
    element: panel,

    addSlider({ label, min = 0, max = 1, step = 0.01, value = min, format = v => v.toFixed(2), onChange }) {
      const row = createControlRowContainer();
      const input = document.createElement('input');
      const readout = document.createElement('span');

      input.type = 'range';
      input.className = CONTROL_CLASS;
      input.setAttribute('aria-label', label);
      input.min = String(min);
      input.max = String(max);
      input.step = String(step);
      input.value = String(value);
      input.style.flex = '1 1 auto';

      Object.assign(readout.style, {
        flex: '0 0 auto',
        minWidth: '42px',
        textAlign: 'right',
        color: '#9fd0ff',
        font: `600 12px ${FONT_STACK}`,
      });

      const render = (v: number) => {
        readout.textContent = format(Number(v));
      };

      render(value);
      input.addEventListener('input', () => {
        const v = Number(input.value);

        render(v);
        onChange?.(v);
      });

      row.append(createControlLabel(label), input, readout);
      panel.append(row);

      return {
        set(v: number) {
          input.value = String(v);
          render(v);
        },
      };
    },

    addToggle({ label, value = false, onChange }) {
      const row = createControlRowContainer();
      const button = document.createElement('button');

      let state = value;

      button.type = 'button';
      button.className = CONTROL_CLASS;
      button.setAttribute('aria-label', label);
      Object.assign(button.style, {
        flex: '1 1 auto',
        padding: '5px 10px',
        borderRadius: '8px',
        border: '1px solid rgba(154, 193, 255, 0.32)',
        background: 'rgba(154, 193, 255, 0.12)',
        color: '#dce8ff',
        font: `600 12px ${FONT_STACK}`,
        cursor: 'pointer',
      });

      const render = () => {
        button.textContent = state ? 'On' : 'Off';
        button.setAttribute('aria-pressed', String(state));
        button.style.background = state ? 'rgba(120, 220, 160, 0.22)' : 'rgba(154, 193, 255, 0.12)';
      };

      render();
      button.addEventListener('click', () => {
        state = !state;
        render();
        onChange?.(state);
      });

      row.append(createControlLabel(label), button);
      panel.append(row);

      return {
        set(v: boolean) {
          state = Boolean(v);
          render();
        },
      };
    },

    addCycle({ label, options: choices, index = 0, onChange }) {
      const row = createControlRowContainer();
      const prev = document.createElement('button');
      const next = document.createElement('button');
      const readout = document.createElement('span');

      let current = index;

      for (const button of [prev, next]) {
        button.type = 'button';
        button.className = CONTROL_CLASS;
        Object.assign(button.style, {
          flex: '0 0 auto',
          width: '26px',
          padding: '4px 0',
          borderRadius: '8px',
          border: '1px solid rgba(154, 193, 255, 0.32)',
          background: 'rgba(154, 193, 255, 0.12)',
          color: '#dce8ff',
          font: `600 13px ${FONT_STACK}`,
          cursor: 'pointer',
        });
      }

      prev.textContent = '‹';
      next.textContent = '›';
      prev.setAttribute('aria-label', `Previous ${label}`);
      next.setAttribute('aria-label', `Next ${label}`);
      readout.setAttribute('aria-live', 'polite');

      Object.assign(readout.style, { flex: '1 1 auto', textAlign: 'center', color: '#9fd0ff', font: `600 12px ${FONT_STACK}` });

      const render = () => {
        readout.textContent = String(choices[current]);
      };

      const move = (delta: number) => {
        current = (current + delta + choices.length) % choices.length;
        render();
        onChange?.(current, choices[current]);
      };

      render();
      prev.addEventListener('click', () => move(-1));
      next.addEventListener('click', () => move(1));

      row.append(createControlLabel(label), prev, readout, next);
      panel.append(row);

      return {
        set(i: number) {
          current = ((i % choices.length) + choices.length) % choices.length;
          render();
        },
      };
    },

    addButton({ label, onClick }) {
      const button = document.createElement('button');

      button.type = 'button';
      button.className = CONTROL_CLASS;
      button.textContent = label;

      Object.assign(button.style, {
        display: 'block',
        width: '100%',
        margin: '6px 0 0',
        padding: '7px 10px',
        borderRadius: '8px',
        border: '1px solid rgba(154, 193, 255, 0.32)',
        background: 'rgba(154, 193, 255, 0.14)',
        color: '#dce8ff',
        font: `600 12px ${FONT_STACK}`,
        cursor: 'pointer',
      });

      button.addEventListener('click', () => onClick?.());
      panel.append(button);

      return { element: button };
    },

    dispose() {
      panel.remove();
    },
  };
};

// ---------------------------------------------------------------------------
// Declarative demo panel
//
// One state object drives both the visible controls and any keyboard or pointer
// shortcut an example adds: shortcuts call `panel.set()`/`panel.step()`, the
// controls re-render from the same value, and `onChange` applies it to the scene
// in exactly one place.
// ---------------------------------------------------------------------------

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

/** One of a fixed list of named options; shows the name and its position, e.g. `Screen (5/18)`. */
export interface ChoiceSpec<T extends string = string> {
  readonly kind: 'choice';
  readonly label: string;
  readonly options: readonly T[];
  readonly value: T;
}

export type DemoControlSpec = SliderSpec | ToggleSpec | ChoiceSpec;

/** The value type a control spec holds. */
export type DemoControlValue<S> = S extends SliderSpec
  ? number
  : S extends ToggleSpec
    ? boolean
    : S extends ChoiceSpec<infer T>
      ? T
      : never;

export type DemoPanelValues<C extends Record<string, DemoControlSpec>> = { -readonly [K in keyof C]: DemoControlValue<C[K]> };

export const slider = (
  label: string,
  options: { min: number; max: number; value: number; step?: number; format?: (value: number) => string },
): SliderSpec => ({ kind: 'slider', step: (options.max - options.min) / 100, ...options, label });

export const toggle = (label: string, value = false): ToggleSpec => ({ kind: 'toggle', label, value });

export const choice = <const T extends string>(label: string, options: readonly T[], value: T = options[0]!): ChoiceSpec<T> => ({
  kind: 'choice',
  label,
  options,
  value,
});

export interface DemoPanelOptions<C extends Record<string, DemoControlSpec>> {
  title?: string;
  corner?: OverlayCorner;
  /** A full-width control strip with native selects and CSS-pixel sizing. */
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
export interface DemoPanel<C extends Record<string, DemoControlSpec>> {
  readonly element: HTMLElement;
  /** Fits a bar to the presented canvas and reports its available scene area in CSS pixels. */
  fit(app: { width: number; height: number }, host: HTMLElement): DemoViewport;
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
export const unitsPerCssPixel = (app: { height: number }, host: HTMLElement): number => {
  const frame = window.frameElement;
  const frameScale = frame && frame.clientHeight > 0 ? frame.getBoundingClientRect().height / frame.clientHeight : 1;
  const height = host.getBoundingClientRect().height * frameScale;

  return height > 0 ? app.height / height : 1;
};

const createOverlayFitter = (element: HTMLElement, corner: OverlayCorner, bar: boolean) => {
  const viewport = { scale: 0, width: 0, height: 0, compact: false, contentHeight: 0 };

  return (app: { width: number; height: number }, host: HTMLElement): DemoViewport => {
    const scale = unitsPerCssPixel(app, host);
    const width = app.width / scale;
    const height = app.height / scale;

    if (scale !== viewport.scale || width !== viewport.width || height !== viewport.height) {
      viewport.scale = scale;
      viewport.width = width;
      viewport.height = height;
      viewport.compact = width < 720 || height < 420;
      element.style.transform = `scale(${scale})`;
      element.toggleAttribute('data-compact', viewport.compact);

      if (bar) {
        element.style.width = `${width}px`;
      } else {
        element.style.transformOrigin = corner.replace('-', ' ');
        element.style.width = `${Math.min(430, Math.max(0, width - 24))}px`;

        for (const side of ['top', 'bottom', 'left', 'right']) {
          element.style.setProperty(side, corner.includes(side) ? `${12 * scale}px` : 'auto', 'important');
        }
      }
    }

    viewport.contentHeight = Math.max(0, height - element.offsetHeight - (bar ? 0 : 24));

    return viewport;
  };
};

/** Crops an explicitly verified one-texel border without changing the shared frame. */
export const insetAtlasFrame = <T extends { x: number; y: number; width: number; height: number; clone(): T }>(frame: T): T => {
  if (frame.width <= 2 || frame.height <= 2) {
    throw new RangeError('Atlas frames must retain a positive area after insetting.');
  }

  // shortcut: use only verified empty borders until extruded atlas assets are available.
  const inset = frame.clone();
  inset.x += 1;
  inset.y += 1;
  inset.width -= 2;
  inset.height -= 2;

  return inset;
};

const styleDemoBar = (element: HTMLElement): (() => void) => {
  const style = document.createElement('style');
  const fontRoot = new URL('../../vendor/fonts/', import.meta.url);

  // Same-origin previews reuse the site's theme; detached or cross-origin examples retain token fallbacks.
  try {
    const source = window.parent.document;
    const tokens = window.parent.getComputedStyle(source.documentElement);

    for (const name of [
      '--color-bg',
      '--color-surface',
      '--color-text',
      '--color-text-muted',
      '--color-accent',
      '--amber',
      '--cyan',
      '--mint',
      '--rose',
      '--f-sans',
      '--f-mono',
    ]) {
      element.style.setProperty(name, tokens.getPropertyValue(name));
    }
  } catch {
    // A cross-origin embed cannot read the surrounding site's theme.
  }

  element.classList.add('exo-demo-bar');
  style.textContent = `
@font-face { font-family:'Space Grotesk'; font-style:normal; font-weight:400; src:url('${fontRoot}space-grotesk-latin-400-normal.woff2') format('woff2'); }
@font-face { font-family:'Space Grotesk'; font-style:normal; font-weight:600; src:url('${fontRoot}space-grotesk-latin-600-normal.woff2') format('woff2'); }
@font-face { font-family:'JetBrains Mono'; font-style:normal; font-weight:400; src:url('${fontRoot}jetbrains-mono-latin-400-normal.woff2') format('woff2'); }
.exo-demo-bar { box-sizing:border-box; display:flex; flex-wrap:wrap; align-items:center; gap:8px 12px;
  inset:auto auto 0 0 !important; max-width:none !important; min-width:0 !important; padding:8px 12px !important;
  border:0 !important; border-radius:0 !important; background:var(--color-bg,#0b1014) !important;
  color:var(--color-text,#eceff2) !important; font:15px var(--f-sans,'Space Grotesk',system-ui,sans-serif) !important;
  transform-origin:bottom left; box-shadow:none !important; }
.exo-demo-bar > strong { flex-basis:100%; font-size:17px !important; margin:0 !important; color:inherit !important; }
.exo-demo-bar > div { margin:0 !important; gap:8px !important; }
.exo-demo-bar > div > span { min-width:0 !important; color:var(--color-text-muted,#a8afb5) !important; font-size:14px !important; }
.exo-demo-bar button,.exo-demo-bar select { min-height:32px; width:auto !important; margin:0 !important; padding:4px 8px !important;
  border:1px solid var(--color-text-muted,#a8afb5) !important; border-radius:4px !important;
  background:var(--color-surface,#12181d) !important; color:inherit !important; font:inherit !important; cursor:pointer; }
.exo-demo-bar input { min-height:32px; width:80px; accent-color:var(--color-accent,#88e97e); }
.exo-demo-bar :focus-visible { outline:2px solid var(--color-accent,#88e97e); outline-offset:2px; }
.exo-demo-bar > .exo-demo-status { flex-basis:100%; color:var(--color-text-muted,#a8afb5) !important;
  font:14px var(--f-mono,'JetBrains Mono',ui-monospace,monospace) !important; }
.exo-demo-bar[data-compact] > strong { display:none !important; }
.exo-demo-hint { flex-basis:100%; font-size:14px !important; color:var(--color-text-muted,#a8afb5) !important; }
.exo-demo-bar[data-compact] .exo-demo-hint { display:none !important; }
.exo-demo-bar .exo-demo-status[data-tone='info'] { color:var(--cyan,#65d2d2) !important; }
.exo-demo-bar .exo-demo-status[data-tone='warning'] { color:var(--amber,#feb354) !important; }
.exo-demo-bar .exo-demo-status[data-tone='success'] { color:var(--mint,#67cfa0) !important; }
.exo-demo-bar .exo-demo-status[data-tone='error'] { color:var(--rose,#ff7c80) !important; }
.exo-demo-caption { display:block !important; border-radius:6px !important; }
.exo-demo-caption[data-compact] > strong { display:block !important; }
.exo-demo-caption kbd,.exo-demo-caption span { font-size:14px !important; color:inherit !important; }
`;
  document.head.append(style);

  return () => {
    style.remove();
  };
};

/**
 * Mounts a small control panel from a declarative control list and keeps one
 * value per control. Keyboard shortcuts should call `set`/`step` so the panel
 * and the shortcut never disagree.
 */
export const demoPanel = <const C extends Record<string, DemoControlSpec>>(options: DemoPanelOptions<C>): DemoPanel<C> => {
  if (options.layout === 'bar' && (Object.keys(options.controls).length > 4 || Object.keys(options.actions ?? {}).length > 3)) {
    throw new RangeError('Curated bars support at most four parameters and three actions.');
  }

  const panel = mountControlPanel({ title: options.title, corner: options.corner });
  const fit = createOverlayFitter(panel.element, options.corner ?? 'bottom-left', true);
  const disposeBar = options.layout === 'bar' ? styleDemoBar(panel.element) : undefined;
  const values = {} as DemoPanelValues<C>;
  const renderers = new Map<keyof C, ControlBinding<never>>();
  const keys = Object.keys(options.controls) as Array<keyof C>;
  const statusEl = document.createElement('div');
  const rows = new Map<keyof C, HTMLElement>();

  const commit = <K extends keyof C>(key: K, value: DemoControlValue<C[K]>, fromControl: boolean): void => {
    values[key] = value as DemoPanelValues<C>[K];

    if (!fromControl) {
      renderers.get(key)?.set(value as never);
    }

    options.onChange?.(key, value, values);

    if (options.layout === 'bar' && !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      rows.get(key)?.animate?.([{ boxShadow: '0 0 0 2px var(--color-accent,#88e97e)' }, { boxShadow: 'none' }], { duration: 450 });
    }
  };

  for (const key of keys) {
    const spec = options.controls[key]!;

    switch (spec.kind) {
      case 'slider': {
        values[key] = spec.value as DemoPanelValues<C>[typeof key];
        renderers.set(
          key,
          panel.addSlider({
            label: spec.label,
            min: spec.min,
            max: spec.max,
            step: spec.step,
            value: spec.value,
            format: spec.format,
            onChange: value => commit(key, value as DemoControlValue<C[typeof key]>, true),
          }) as ControlBinding<never>,
        );
        break;
      }
      case 'toggle': {
        values[key] = spec.value as DemoPanelValues<C>[typeof key];
        renderers.set(
          key,
          panel.addToggle({
            label: spec.label,
            value: spec.value,
            onChange: value => commit(key, value as DemoControlValue<C[typeof key]>, true),
          }) as ControlBinding<never>,
        );
        break;
      }
      case 'choice': {
        if (options.layout === 'bar') {
          const row = document.createElement('label');
          const select = document.createElement('select');

          row.textContent = `${spec.label} `;
          select.setAttribute('aria-label', spec.label);

          for (const name of spec.options) {
            select.add(new Option(name, name));
          }

          select.value = spec.value;
          select.addEventListener('change', () => commit(key, select.value as DemoControlValue<C[typeof key]>, true));
          row.append(select);
          panel.element.append(row);
          values[key] = spec.value as DemoPanelValues<C>[typeof key];
          renderers.set(key, {
            set: (value: never) => {
              select.value = value;
            },
          });
          break;
        }

        const labelled = spec.options.map((name, index) => `${name} (${index + 1}/${spec.options.length})`);
        const binding = panel.addCycle({
          label: spec.label,
          options: labelled,
          index: Math.max(0, spec.options.indexOf(spec.value)),
          onChange: index => commit(key, spec.options[index] as DemoControlValue<C[typeof key]>, true),
        });

        values[key] = spec.value as DemoPanelValues<C>[typeof key];
        renderers.set(key, { set: (value: never) => binding.set(spec.options.indexOf(value)) });
        break;
      }
    }

    rows.set(key, panel.element.lastElementChild as HTMLElement);
  }

  if (options.hint) {
    const hint = document.createElement('div');
    hint.className = 'exo-demo-hint';
    hint.textContent = options.hint;
    panel.element.prepend(hint);
  }

  for (const [label, run] of Object.entries(options.actions ?? {})) {
    panel.addButton({ label, onClick: run });
  }

  Object.assign(statusEl.style, { marginTop: '6px', font: `600 12px ${FONT_STACK}`, color: '#9fd0ff' });
  statusEl.className = 'exo-demo-status';
  statusEl.setAttribute('aria-live', 'polite');
  statusEl.hidden = true;
  panel.element.append(statusEl);

  const handle: DemoPanel<C> = {
    element: panel.element,
    fit,
    values,
    set: (key, value) => commit(key, value, false),
    step(key, delta = 1) {
      const spec = options.controls[key]!;

      if (spec.kind === 'toggle') {
        commit(key, !values[key] as DemoControlValue<C[typeof key]>, false);
      } else if (spec.kind === 'choice') {
        const count = spec.options.length;
        const index = spec.options.indexOf(values[key] as string);

        commit(key, spec.options[(((index + delta) % count) + count) % count] as DemoControlValue<C[typeof key]>, false);
      } else {
        const next = Math.min(spec.max, Math.max(spec.min, (values[key] as number) + delta * spec.step));

        commit(key, next as DemoControlValue<C[typeof key]>, false);
      }
    },
    status(text, tone = 'neutral') {
      if (statusEl.textContent !== text) {
        statusEl.textContent = text;
      }

      statusEl.dataset.tone = tone;
      statusEl.setAttribute('role', tone === 'error' ? 'alert' : 'status');
      statusEl.hidden = text === '';
    },
    dispose: () => {
      disposeBar?.();
      panel.dispose();
    },
  };

  for (const key of keys) {
    options.onChange?.(key, values[key], values);
  }

  return handle;
};
