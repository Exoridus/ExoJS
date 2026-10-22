import { afterEach, describe, expect, it, vi } from 'vitest';

import { choice, demoPanel, slider, toggle } from '../../examples/shared/runtime.ts';

const controls = () => ({
  mode: choice('Mode', ['Normal', 'Additive', 'Screen']),
  amount: slider('Amount', { min: 0, max: 1, value: 0.5, step: 0.25 }),
  paused: toggle('Paused'),
});

afterEach(() => document.body.replaceChildren());

describe('demoPanel', () => {
  it('applies every initial value once through onChange', () => {
    const onChange = vi.fn();

    demoPanel({ controls: controls(), onChange });

    expect(onChange.mock.calls.map(([key, value]) => [key, value])).toEqual([
      ['mode', 'Normal'],
      ['amount', 0.5],
      ['paused', false],
    ]);
  });

  it('keeps one state for shortcuts and controls', () => {
    const onChange = vi.fn();
    const panel = demoPanel({ controls: controls(), onChange });
    const readout = () => panel.element.querySelector('[aria-live="polite"]')?.textContent;

    panel.step('mode');
    expect(panel.values.mode).toBe('Additive');
    expect(readout()).toBe('Additive (2/3)');

    panel.step('mode', -2);
    expect(panel.values.mode).toBe('Screen');

    panel.element.querySelector<HTMLButtonElement>('[aria-label="Next Mode"]')!.click();
    expect(panel.values.mode).toBe('Normal');
    expect(onChange).toHaveBeenLastCalledWith('mode', 'Normal', panel.values);

    panel.step('paused');
    expect(panel.values.paused).toBe(true);
    expect(panel.element.querySelector('[aria-label="Paused"]')?.getAttribute('aria-pressed')).toBe('true');
  });

  it('clamps slider steps and mirrors set() into the input', () => {
    const panel = demoPanel({ controls: controls() });
    const input = panel.element.querySelector<HTMLInputElement>('input[type="range"]')!;

    panel.step('amount', 10);
    expect(panel.values.amount).toBe(1);

    panel.set('amount', 0.25);
    expect(input.value).toBe('0.25');
  });

  it('shows the status line only while it has text', () => {
    const panel = demoPanel({ controls: {} });
    const status = panel.element.lastElementChild as HTMLElement;

    expect(status.hidden).toBe(true);
    panel.status('3 lights');
    expect(status.hidden).toBe(false);
    expect(status.textContent).toBe('3 lights');
    panel.status('');
    expect(status.hidden).toBe(true);
  });

  it('removes its element on dispose', () => {
    const panel = demoPanel({ controls: controls() });

    panel.dispose();
    expect(panel.element.isConnected).toBe(false);
  });
});
