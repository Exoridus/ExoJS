// Auto-generated from runtime.ts - edit the .ts source, not this file.
import {
  Button,
  Color,
  Container,
  createUITheme,
  defaultUITheme,
  Dropdown,
  Label,
  Panel,
  ScrollContainer,
  Slider,
  Toggle,
} from '@codexo/exojs';
/** Starts a sample while reporting initialized renderer state and retaining the original startup rejection. */
export const startExample = async (app, start) => {
  const requested = app.options.backend?.type ?? 'auto';
  const attempted = app.backend.backendType;
  let completed = false;
  let lost = false;
  const publish = (phase, actual, reason = null) => {
    const status = { requested, phase, actual, reason };
    window.__EXAMPLE_RENDERER_STATUS__ = status;
    window.dispatchEvent(new CustomEvent('exo-renderer-status', { detail: status }));
  };
  const active = () => {
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
  const onLost = () => {
    lost = true;
    publish('failed', null, 'The renderer device or context was lost. Waiting for restoration.');
  };
  const onRestored = () => {
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
export const siteUITheme = () => {
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
  const color = (token, fallback) => {
    if (!context) {
      return Color.fromHex(fallback);
    }
    context.clearRect(0, 0, 1, 1);
    context.fillStyle = tokens.getPropertyValue(token).trim() || fallback;
    context.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = context.getImageData(0, 0, 1, 1).data;
    return new Color(r, g, b, a / 255);
  };
  const surface = color('--color-surface', '#12181d');
  const raised = color('--color-surface-2', '#191f24');
  const text = color('--color-text', '#eceff2');
  const muted = color('--color-text-muted', '#a8afb5');
  const accent = color('--color-accent', '#88e97e');
  const contrast = color('--color-accent-contrast', '#15351a');
  const patch = {};
  const highlights = new Set(['progressBarFill', 'sliderFill', 'checkboxMark', 'caret', 'selection']);
  for (const role of Object.keys(defaultUITheme)) {
    const states = {};
    for (const state of ['normal', 'hover', 'pressed', 'disabled', 'focused']) {
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
export const getExampleMeta = () => {
  const meta = globalThis.__EXAMPLE_META__;
  return meta && typeof meta === 'object' ? meta : {};
};
export const supportsWebGpu = () => typeof navigator !== 'undefined' && 'gpu' in navigator;
export const createInfoElement = (maxWidth = '430px') => {
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
export const showInfo = (element, title, detail, isError = false) => {
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
export const formatErrorMessage = error => (error instanceof Error ? error.message : String(error));
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
const CORNER_STYLES = {
  'top-left': { top: '16px', left: '16px' },
  'top-right': { top: '16px', right: '16px' },
  'bottom-left': { bottom: '16px', left: '16px' },
  'bottom-right': { bottom: '16px', right: '16px' },
};
const createPanel = (corner = 'top-left') => {
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
const createKeyChip = label => {
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
const createControlRow = control => {
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
export const mountControls = (options = {}) => {
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
  const renderControls = list => controlsEl.replaceChildren(...list.map(createControlRow));
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
    setStatus(text) {
      if (statusEl.textContent !== text) {
        statusEl.textContent = text ?? '';
      }
    },
    setControls(list) {
      renderControls(list ?? []);
    },
    setHint(text) {
      hintEl.textContent = text ?? '';
    },
    dispose() {
      disposeTheme?.();
      panel.remove();
    },
  };
};
/**
 * Records `PointerEvent.button` for every press on `canvas` at the moment it
 * happens. Engine pointer signals are delivered at the next frame, when
 * `Pointer.buttons` already reads the live state, so a press released before
 * delivery cannot be told apart from a main press there; `take` hands the
 * recorded button back to the signal handler in the order the presses occurred.
 */
export const trackPressButtons = canvas => {
  const queues = new Map();
  const root = canvas.ownerDocument;
  const onDown = event => {
    if (event.target !== canvas) {
      return;
    }
    const { pointerId, button } = event;
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
const ensureControlStyles = () => {
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
const createControlRowContainer = () => {
  const row = document.createElement('div');
  Object.assign(row.style, { display: 'flex', alignItems: 'center', gap: '10px', margin: '6px 0' });
  return row;
};
const createControlLabel = text => {
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
export const mountControlPanel = (options = {}) => {
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
  const stop = event => event.stopPropagation();
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
      const render = v => {
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
        set(v) {
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
        set(v) {
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
      const move = delta => {
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
        set(i) {
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
export const slider = (label, options) => ({ kind: 'slider', step: (options.max - options.min) / 100, ...options, label });
export const toggle = (label, value = false) => ({ kind: 'toggle', label, value });
export const choice = (label, options, value = options[0]) => ({
  kind: 'choice',
  label,
  options,
  value,
});
/** Includes the outer preview transform when measuring displayed pixels. Returns 1 while hidden. */
export const unitsPerCssPixel = (app, host) => {
  const frame = window.frameElement;
  const frameScale = frame && frame.clientHeight > 0 ? frame.getBoundingClientRect().height / frame.clientHeight : 1;
  const height = host.getBoundingClientRect().height * frameScale;
  return height > 0 ? app.height / height : 1;
};
const createOverlayFitter = (element, corner, bar) => {
  const viewport = { scale: 0, width: 0, height: 0, compact: false, contentHeight: 0 };
  return (app, host) => {
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
export const insetAtlasFrame = frame => {
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
const styleDemoBar = element => {
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
export const domDemoPanel = options => {
  if (options.layout === 'bar' && (Object.keys(options.controls).length > 4 || Object.keys(options.actions ?? {}).length > 3)) {
    throw new RangeError('Curated bars support at most four parameters and three actions.');
  }
  const panel = mountControlPanel({ title: options.title, corner: options.corner });
  const fit = createOverlayFitter(panel.element, options.corner ?? 'bottom-left', options.layout === 'bar');
  const disposeBar = options.layout === 'bar' ? styleDemoBar(panel.element) : undefined;
  const values = {};
  const renderers = new Map();
  const keys = Object.keys(options.controls);
  const statusEl = document.createElement('div');
  const rows = new Map();
  const commit = (key, value, fromControl) => {
    values[key] = value;
    if (!fromControl) {
      renderers.get(key)?.set(value);
    }
    options.onChange?.(key, value, values);
    if (options.layout === 'bar' && !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      rows.get(key)?.animate?.([{ boxShadow: '0 0 0 2px var(--color-accent,#88e97e)' }, { boxShadow: 'none' }], { duration: 450 });
    }
  };
  for (const key of keys) {
    const spec = options.controls[key];
    switch (spec.kind) {
      case 'slider': {
        values[key] = spec.value;
        renderers.set(
          key,
          panel.addSlider({
            label: spec.label,
            min: spec.min,
            max: spec.max,
            step: spec.step,
            value: spec.value,
            format: spec.format,
            onChange: value => commit(key, value, true),
          }),
        );
        break;
      }
      case 'toggle': {
        values[key] = spec.value;
        renderers.set(
          key,
          panel.addToggle({
            label: spec.label,
            value: spec.value,
            onChange: value => commit(key, value, true),
          }),
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
          select.addEventListener('change', () => commit(key, select.value, true));
          row.append(select);
          panel.element.append(row);
          values[key] = spec.value;
          renderers.set(key, {
            set: value => {
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
          onChange: index => commit(key, spec.options[index], true),
        });
        values[key] = spec.value;
        renderers.set(key, { set: value => binding.set(spec.options.indexOf(value)) });
        break;
      }
    }
    rows.set(key, panel.element.lastElementChild);
  }
  if (options.hint) {
    const hint = document.createElement('div');
    hint.className = 'exo-demo-hint';
    hint.textContent = options.hint;
    const title = panel.element.querySelector(':scope > strong');
    if (title) {
      title.after(hint);
    } else {
      panel.element.prepend(hint);
    }
  }
  for (const [label, run] of Object.entries(options.actions ?? {})) {
    panel.addButton({ label, onClick: run });
  }
  Object.assign(statusEl.style, { marginTop: '6px', font: `600 12px ${FONT_STACK}`, color: '#9fd0ff' });
  statusEl.className = 'exo-demo-status';
  statusEl.setAttribute('aria-live', 'polite');
  statusEl.hidden = true;
  panel.element.append(statusEl);
  const handle = {
    element: panel.element,
    fit,
    values,
    set: (key, value) => commit(key, value, false),
    step(key, delta = 1) {
      const spec = options.controls[key];
      if (spec.kind === 'toggle') {
        commit(key, !values[key], false);
      } else if (spec.kind === 'choice') {
        const count = spec.options.length;
        const index = spec.options.indexOf(values[key]);
        commit(key, spec.options[(((index + delta) % count) + count) % count], false);
      } else {
        const next = Math.min(spec.max, Math.max(spec.min, values[key] + delta * spec.step));
        commit(key, next, false);
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
class DemoDropdown extends Dropdown {
  above = false;
  placeList(above) {
    this.above = above;
    const insets = this.theme.dropdownList.normal.insets;
    const height = this.items.length * this.uiHeight + insets.top + insets.bottom;
    this.listNode.setPosition(0, above ? -height : this.uiHeight);
  }
  _relayout() {
    super._relayout();
    this.placeList(this.above);
  }
}
/** Scene-owned parameter controls with one shared state for widgets and shortcuts. */
export const demoPanel = options => {
  if (options.layout === 'bar' && (Object.keys(options.controls).length > 4 || Object.keys(options.actions ?? {}).length > 3)) {
    throw new RangeError('Curated bars support at most four parameters and three actions.');
  }
  if (Object.values(options.controls).some(spec => spec.kind === 'choice' && spec.options.length === 0)) {
    throw new RangeError('Choice controls require at least one option.');
  }
  const { scene } = options;
  const app = scene.app;
  const element = new Panel();
  element.zIndex = 100;
  scene.ui.addChild(element);
  const title = new Label(options.title ?? '', { fontSize: 16 });
  element.addChild(title);
  const hint = new Label(options.hint ?? '', { fontSize: 13 });
  element.addChild(hint);
  const status = new Label('', { fontSize: 13 });
  element.addChild(status);
  status.visible = false;
  const scroll = new ScrollContainer({ width: 1, height: 1, scrollbarThickness: 12 });
  element.addChild(scroll);
  const values = {};
  const renderers = new Map();
  const keys = Object.keys(options.controls);
  const rows = [];
  const actions = {};
  const controlHeight = window.matchMedia?.('(pointer: coarse)').matches ? 44 : 32;
  const rowHeight = controlHeight === 44 ? 68 : 60;
  const actionRowHeight = controlHeight + 8;
  let syncing = false;
  let disposed = false;
  let dirty = true;
  let statusTone = 'neutral';
  let lastRootScale = 0;
  const viewport = { scale: 0, width: 0, height: 0, compact: false, contentHeight: 0 };
  const commit = (key, value) => {
    if (syncing || disposed) {
      return;
    }
    syncing = true;
    try {
      values[key] = renderers.get(key)(value);
    } finally {
      syncing = false;
    }
    dirty = true;
    options.onChange?.(key, values[key], values);
  };
  for (const key of keys) {
    const spec = options.controls[key];
    const row = new Container();
    scroll.content.addChild(row);
    const label = new Label(spec.label, { fontSize: 13 });
    row.addChild(label);
    label.textNode.layout = { maxHeight: 18, overflow: 'ellipsis' };
    values[key] = spec.value;
    if (spec.kind === 'slider') {
      const readout = new Label('', { fontSize: 13 });
      row.addChild(readout);
      const control = new Slider({ ...spec, height: controlHeight, thumbSize: controlHeight === 44 ? 24 : 18 });
      row.addChild(control);
      control.setPosition(0, 20);
      const render = value => {
        control.value = value;
        readout.text = spec.format?.(control.value) ?? control.value.toFixed(2);
        return control.value;
      };
      render(spec.value);
      renderers.set(key, render);
      control.onChange.add(value => commit(key, value));
      rows.push({
        node: row,
        resize: width => {
          control.setSize(width, controlHeight);
          readout.setPosition(Math.max(0, width - readout.uiWidth), 0);
          label.textNode.layout = { maxWidth: Math.max(1, width - readout.uiWidth - 8), maxHeight: 18, overflow: 'ellipsis' };
        },
      });
    } else if (spec.kind === 'toggle') {
      const control = new Toggle({ checked: spec.value, width: controlHeight === 44 ? 68 : 48, height: controlHeight });
      row.addChild(control);
      control.setPosition(0, 20);
      renderers.set(key, value => {
        control.checked = value;
        return value;
      });
      control.onChange.add(value => commit(key, value));
      rows.push({
        node: row,
        resize: width => {
          label.textNode.layout = { maxWidth: width, maxHeight: 18, overflow: 'ellipsis' };
        },
      });
    } else {
      const select = new DemoDropdown({
        height: controlHeight,
        padding: 8,
        items: spec.options.map(value => ({ label: value, value })),
        selectedIndex: spec.options.indexOf(spec.value),
        textStyle: { fontSize: 14 },
      });
      row.addChild(select);
      select.setPosition(0, 20);
      const previous = new Button({ label: '<', width: controlHeight, height: controlHeight, fontSize: 14 });
      row.addChild(previous);
      const next = new Button({ label: '>', width: controlHeight, height: controlHeight, fontSize: 14 });
      row.addChild(next);
      const selected = new Label(spec.value, { fontSize: 14 });
      row.addChild(selected);
      previous.setPosition(0, 20);
      selected.setPosition(controlHeight + 8, 20 + (controlHeight - 20) / 2);
      previous.onClick.add(() => handle.step(key, -1));
      next.onClick.add(() => handle.step(key));
      select.onChange.add(value => commit(key, value));
      renderers.set(key, value => {
        select.selectedIndex = spec.options.indexOf(value);
        selected.text = value;
        return value;
      });
      rows.push({
        node: row,
        resize: (width, screenY, screenHeight, allowPopup) => {
          const above = screenY + 20;
          const below = screenHeight - screenY - 20 - controlHeight;
          const insets = select.theme.dropdownList.normal.insets;
          const listHeight = spec.options.length * controlHeight + insets.top + insets.bottom;
          const fits = allowPopup && listHeight <= Math.max(above, below);
          select.visible = fits;
          previous.visible = next.visible = selected.visible = !fits;
          select.setSize(width, controlHeight);
          select.placeList(above >= below);
          if (!fits) {
            select.close();
          }
          next.setPosition(Math.max(0, width - controlHeight), 20);
          selected.textNode.layout = { maxWidth: Math.max(1, width - 2 * (controlHeight + 8)), maxHeight: 20, overflow: 'ellipsis' };
          label.textNode.layout = { maxWidth: width, maxHeight: 18, overflow: 'ellipsis' };
        },
      });
    }
  }
  for (const [label, run] of Object.entries(options.actions ?? {})) {
    const button = new Button({ label, height: controlHeight, fontSize: 14 });
    scroll.content.addChild(button);
    button.onClick.add(run);
    actions[label] = button;
  }
  const reveal = (top, height) => {
    if (top < scroll.scrollY) {
      scroll.scrollTo(0, top);
    } else if (top + height > scroll.scrollY + scroll.uiHeight) {
      scroll.scrollTo(0, top + height - scroll.uiHeight);
    }
  };
  for (const row of rows) {
    for (const control of row.node.children) {
      if (control.focusable) {
        control.onFocus.add(() => reveal(row.node.y, rowHeight - 4));
      }
    }
  }
  for (const button of Object.values(actions)) {
    button.onFocus.add(() => reveal(button.y, button.uiHeight));
  }
  const fit = (app, host) => {
    if (disposed) {
      return viewport;
    }
    const scale = unitsPerCssPixel(app, host);
    const width = app.width / scale;
    const height = app.height / scale;
    const rootScale = scene.ui.uiScale;
    if (!dirty && scale === viewport.scale && width === viewport.width && height === viewport.height && rootScale === lastRootScale) {
      return viewport;
    }
    dirty = false;
    lastRootScale = rootScale;
    Object.assign(viewport, { scale, width, height, compact: width < 720 || height < 420 });
    const bar = options.layout === 'bar' || viewport.compact;
    const panelWidth = bar ? width : Math.min(300, Math.max(0, width - 24));
    const innerWidth = Math.max(1, panelWidth - 24);
    const columns = Math.max(1, Math.floor((innerWidth + 12) / 220));
    const cellWidth = (innerWidth - (columns - 1) * 12 - 16) / columns;
    let y = 10;
    title.visible = !!options.title && !viewport.compact;
    hint.visible = !!options.hint && !viewport.compact;
    for (const label of [title, hint]) {
      label.textNode.layout = { maxWidth: innerWidth, maxHeight: 20, overflow: 'ellipsis' };
      label.setPosition(12, y);
      if (label.visible) {
        y += 24;
      }
    }
    const controlsY = y;
    let contentHeight = Math.ceil(rows.length / columns) * rowHeight;
    let actionX = 0;
    let actionRows = 0;
    for (const button of Object.values(actions)) {
      const buttonWidth = Math.min(innerWidth - 16, Math.max(84, button.labelNode.textBounds.width + 24));
      if (actionX > 0 && actionX + buttonWidth > innerWidth - 16) {
        actionX = 0;
        actionRows++;
      }
      button.setSize(buttonWidth, controlHeight).setPosition(actionX, contentHeight + actionRows * actionRowHeight);
      actionX += buttonWidth + 8;
    }
    if (actionX > 0) {
      contentHeight += (actionRows + 1) * actionRowHeight;
    }
    status.textNode.layout = { maxWidth: innerWidth, maxHeight: viewport.compact ? 32 : 48, overflow: 'ellipsis' };
    const statusHeight = status.visible ? Math.min(viewport.compact ? 32 : 48, status.textNode.textBounds.height) + 4 : 0;
    const panelBudget = viewport.compact ? Math.min(height * 0.65, height - 70) : height * 0.8;
    const visibleHeight = Math.min(contentHeight, Math.max(rowHeight - 8, panelBudget - controlsY - statusHeight - 6));
    const overflow = visibleHeight < contentHeight;
    scroll.setSize(innerWidth, visibleHeight).setPosition(12, controlsY);
    scroll.clip = overflow;
    y += visibleHeight;
    status.setPosition(12, y);
    y += statusHeight;
    const panelHeight = y + 6;
    const corner = bar ? 'bottom-left' : (options.corner ?? 'bottom-left');
    const x = corner.endsWith('right') ? width - panelWidth - 12 : bar ? 0 : 12;
    const top = corner.startsWith('bottom') ? Math.max(0, height - panelHeight - (bar ? 0 : 12)) : 12;
    element
      .setSize(panelWidth, panelHeight)
      .setScale(scale / rootScale)
      .setPosition((x * scale) / rootScale, (top * scale) / rootScale);
    rows.forEach((row, index) => {
      const rowY = Math.floor(index / columns) * rowHeight;
      row.node.setPosition((index % columns) * (cellWidth + 12), rowY);
      row.resize(cellWidth, top + controlsY + rowY - scroll.scrollY, height, !overflow);
    });
    scroll.refresh();
    viewport.contentHeight = Math.max(0, height - panelHeight - (bar ? 0 : 24));
    return viewport;
  };
  const onFrame = () => {
    fit(app, app.canvas);
  };
  const dispose = () => {
    if (!disposed) {
      disposed = true;
      app.onFrame.remove(onFrame);
      if (!element.destroyed) {
        element.destroy();
      }
    }
  };
  const handle = {
    element,
    actions,
    fit,
    values,
    set: (key, value) => commit(key, value),
    step(key, delta = 1) {
      const spec = options.controls[key];
      if (spec.kind === 'toggle') {
        commit(key, !values[key]);
      } else if (spec.kind === 'choice') {
        const count = spec.options.length;
        const index = spec.options.indexOf(values[key]);
        commit(key, spec.options[(((index + delta) % count) + count) % count]);
      } else {
        commit(key, Math.min(spec.max, Math.max(spec.min, values[key] + delta * spec.step)));
      }
    },
    status(text, tone = 'neutral') {
      if (disposed || (status.text === text && statusTone === tone)) {
        return;
      }
      const previousHeight = status.visible ? status.textNode.textBounds.height : 0;
      status.text = text;
      status.visible = text !== '';
      if (statusTone !== tone) {
        status.setTextStyle({ fillColor: tones[tone] });
      }
      statusTone = tone;
      dirty ||= previousHeight !== (status.visible ? status.textNode.textBounds.height : 0);
    },
    dispose,
  };
  scene.track({ destroy: dispose });
  app.onFrame.add(onFrame);
  onFrame();
  for (const key of keys) {
    options.onChange?.(key, values[key], values);
  }
  return handle;
};
const tones = {
  neutral: Color.fromHex('#b3c1cd'),
  info: Color.fromHex('#7ed6e0'),
  warning: Color.fromHex('#f2c078'),
  success: Color.fromHex('#88dfc3'),
  error: Color.fromHex('#ff929b'),
};
