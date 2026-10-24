// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';

import { choice, demoPanel, insetAtlasFrame, slider, unitsPerCssPixel } from '../../examples/shared/runtime';

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

it('keeps hidden iframe measurements finite without inflating text', () => {
  const canvas = document.createElement('canvas');
  const frame = document.createElement('iframe');

  vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({ height: 0 } as DOMRect);
  vi.spyOn(frame, 'getBoundingClientRect').mockReturnValue({ height: 0 } as DOMRect);
  vi.spyOn(window, 'frameElement', 'get').mockReturnValue(frame);
  expect(unitsPerCssPixel({ height: 720 }, canvas)).toBe(1);
  vi.restoreAllMocks();
});

it('fits bars in displayed pixels and reports the unobstructed height', () => {
  const canvas = document.createElement('canvas');
  vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({ height: 288 } as DOMRect);
  const panel = demoPanel({ layout: 'bar', controls: {}, hint: 'Drag the subject' });
  Object.defineProperty(panel.element, 'offsetHeight', { value: 48 });
  const viewport = panel.fit({ width: 1280, height: 720 }, canvas);
  expect(viewport).toEqual({ scale: 2.5, width: 512, height: 288, compact: true, contentHeight: 240 });
  expect(panel.element.style.transform).toBe('scale(2.5)');
  expect(panel.fit({ width: 1280, height: 720 }, canvas)).toBe(viewport);
  panel.dispose();
});

it('keeps semantic status updates quiet when the message is unchanged', () => {
  const panel = demoPanel({ layout: 'bar', controls: {} });
  panel.status('File failed', 'warning');
  const status = panel.element.querySelector('.exo-demo-status')!;
  const original = status.firstChild;
  panel.status('File failed', 'warning');
  expect(status.firstChild).toBe(original);
  expect(status.getAttribute('data-tone')).toBe('warning');
  panel.dispose();
});

it('rejects overloaded curated bars before mounting anything', () => {
  expect(() =>
    demoPanel({
      layout: 'bar',
      controls: { a: choice('A', ['a']), b: choice('B', ['b']), c: choice('C', ['c']), d: choice('D', ['d']), e: choice('E', ['e']) },
    }),
  ).toThrow(RangeError);
  expect(document.querySelector('.exo-demo-bar')).toBeNull();
});

it('crops verified atlas borders without mutating the shared frame', () => {
  const frame = {
    x: 4,
    y: 8,
    width: 16,
    height: 20,
    clone() {
      return { ...this };
    },
  };
  expect(insetAtlasFrame(frame)).toMatchObject({ x: 5, y: 9, width: 14, height: 18 });
  expect(frame.width).toBe(16);
  expect(() => insetAtlasFrame({ ...frame, width: 2 })).toThrow(RangeError);
});
