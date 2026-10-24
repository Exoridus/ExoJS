// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';

import { choice, demoPanel, slider, unitsPerCssPixel } from '../../examples/shared/runtime';

afterEach(() => document.body.replaceChildren());

it('keeps bar choices, keyboard changes and reset on the same state', () => {
  const change = vi.fn();
  const panel = demoPanel({
    title: 'Text Layout',
    layout: 'bar',
    controls: { font: choice('Font', ['System', 'Kenney']), width: slider('Width', { min: 100, max: 600, value: 400, step: 20 }) },
    onChange: change,
  });
  const select = panel.element.querySelector('select')!;

  expect(select.getAttribute('aria-label')).toBe('Font');
  select.value = 'Kenney';
  select.dispatchEvent(new Event('change'));
  expect(panel.values.font).toBe('Kenney');
  panel.step('font');
  expect(select.value).toBe('System');
  panel.step('width', 100);
  expect(panel.values.width).toBe(600);
  expect(change).toHaveBeenLastCalledWith('width', 600, panel.values);
  panel.dispose();
  expect(document.body.contains(select)).toBe(false);
});

it('measures scene units against the presented canvas size', () => {
  const canvas = document.createElement('canvas');

  vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({ height: 288 } as DOMRect);
  expect(unitsPerCssPixel({ height: 720 }, canvas)).toBe(2.5);
});

it('includes the outer iframe transform without a cross-realm instanceof check', () => {
  const canvas = document.createElement('canvas');
  const realm = document.createElement('iframe');

  document.body.append(realm);
  const frame = realm.contentDocument!.createElement('iframe');

  vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({ height: 720 } as DOMRect);
  vi.spyOn(frame, 'getBoundingClientRect').mockReturnValue({ height: 288 } as DOMRect);
  Object.defineProperty(frame, 'clientHeight', { value: 720 });
  vi.spyOn(window, 'frameElement', 'get').mockReturnValue(frame);
  expect(unitsPerCssPixel({ height: 720 }, canvas)).toBe(2.5);
  vi.restoreAllMocks();
});
