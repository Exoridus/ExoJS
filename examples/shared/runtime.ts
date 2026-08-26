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
  addSlider(options: { label: string; min?: number; max?: number; step?: number; value?: number; onChange?: (value: number) => void }): ControlBinding<number>;
  addToggle(options: { label: string; value?: boolean; onChange?: (value: boolean) => void }): ControlBinding<boolean>;
  addCycle(options: { label: string; options: string[]; index?: number; onChange?: (index: number, value: string) => void }): ControlBinding<number>;
  addButton(options: { label: string; onClick?: () => void }): { element: HTMLButtonElement };
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

export function getExampleMeta(): ExampleRuntimeMeta {
  const meta = globalThis.__EXAMPLE_META__;

  return meta && typeof meta === 'object' ? meta : {};
}

export function supportsWebGpu(): boolean {
  return typeof navigator !== 'undefined' && 'gpu' in navigator;
}

export function createInfoElement(maxWidth = '430px'): HTMLElement {
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
}

export function showInfo(element: HTMLElement, title: string, detail: string, isError = false): void {
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
}

export function formatErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

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

function createPanel(corner: OverlayCorner = 'top-left'): HTMLElement {
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
}

function createKeyChip(label: string): HTMLElement {
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
}

function createControlRow(control: ControlHint): HTMLElement {
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
}

/**
 * Mount a non-blocking on-screen panel with a title, a controls legend, an
 * optional live status line, and an optional hint. Returns a handle to update
 * the status/controls and to remove the panel.
 */
export function mountControls(options: MountControlsOptions = {}): ControlsHandle {
  const { title = '', controls = [], status = '', hint = '', corner = 'top-left' } = options;

  const panel = createPanel(corner);
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

  panel.append(titleEl, controlsEl, statusEl, hintEl);
  document.body.append(panel);

  return {
    element: panel,
    setStatus(text: string) {
      statusEl.textContent = text ?? '';
    },
    setControls(list: ControlHint[]) {
      renderControls(list ?? []);
    },
    setHint(text: string) {
      hintEl.textContent = text ?? '';
    },
    dispose() {
      panel.remove();
    },
  };
}

function createControlRowContainer(): HTMLElement {
  const row = document.createElement('div');

  Object.assign(row.style, { display: 'flex', alignItems: 'center', gap: '10px', margin: '6px 0' });

  return row;
}

function createControlLabel(text: string): HTMLElement {
  const label = document.createElement('span');

  label.textContent = text;

  Object.assign(label.style, { flex: '0 0 auto', minWidth: '92px', color: '#c4d2ec', fontSize: '12px' });

  return label;
}

/**
 * Mount a predictable DOM control panel over the canvas - sliders, toggles,
 * cycles, and buttons - so interactive examples expose their parameters in a
 * consistent, discoverable way instead of hand-rolling canvas hit-tests.
 */
export function mountControlPanel(options: MountControlPanelOptions = {}): ControlPanelHandle {
  const { title = '', corner = 'bottom-left' } = options;

  const panel = createPanel(corner);

  panel.style.pointerEvents = 'auto';
  panel.style.minWidth = '230px';

  if (title) {
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

    addSlider({ label, min = 0, max = 1, step = 0.01, value = min, onChange }) {
      const row = createControlRowContainer();
      const input = document.createElement('input');
      const readout = document.createElement('span');

      input.type = 'range';
      input.min = String(min);
      input.max = String(max);
      input.step = String(step);
      input.value = String(value);
      input.style.flex = '1 1 auto';

      Object.assign(readout.style, { flex: '0 0 auto', minWidth: '42px', textAlign: 'right', color: '#9fd0ff', font: `600 12px ${FONT_STACK}` });

      const render = (v: number) => {
        readout.textContent = Number(v).toFixed(2);
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
}
