// Auto-generated from runtime.ts - edit the .ts source, not this file.
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
  panel.append(titleEl, controlsEl, statusEl, hintEl);
  document.body.append(panel);
  return {
    element: panel,
    setStatus(text) {
      statusEl.textContent = text ?? '';
    },
    setControls(list) {
      renderControls(list ?? []);
    },
    setHint(text) {
      hintEl.textContent = text ?? '';
    },
    dispose() {
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
    take: pointerId => queues.get(pointerId)?.shift() ?? 0,
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
  }
  if (title) {
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
/**
 * Mounts a small control panel from a declarative control list and keeps one
 * value per control. Keyboard shortcuts should call `set`/`step` so the panel
 * and the shortcut never disagree.
 */
export const demoPanel = options => {
  const panel = mountControlPanel({ title: options.title, corner: options.corner });
  const values = {};
  const renderers = new Map();
  const keys = Object.keys(options.controls);
  const statusEl = document.createElement('div');
  const commit = (key, value, fromControl) => {
    values[key] = value;
    if (!fromControl) {
      renderers.get(key)?.set(value);
    }
    options.onChange?.(key, value, values);
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
  }
  for (const [label, run] of Object.entries(options.actions ?? {})) {
    panel.addButton({ label, onClick: run });
  }
  Object.assign(statusEl.style, { marginTop: '6px', font: `600 12px ${FONT_STACK}`, color: '#9fd0ff' });
  statusEl.setAttribute('aria-live', 'polite');
  statusEl.hidden = true;
  panel.element.append(statusEl);
  const handle = {
    element: panel.element,
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
    status(text) {
      statusEl.textContent = text;
      statusEl.hidden = text === '';
    },
    dispose: () => panel.dispose(),
  };
  for (const key of keys) {
    options.onChange?.(key, values[key], values);
  }
  return handle;
};
