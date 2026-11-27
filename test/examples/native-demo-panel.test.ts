import { Button, Container, Dropdown, Label, Panel, ScrollContainer, Slider, Toggle } from '@codexo/exojs';
import { expect, it, vi } from 'vitest';

import { choice, demoPanel, slider, toggle } from '../../examples/shared/runtime.ts';
import { createUIApp } from '../support/text-field-harness';

const descendants = (node: Container): Array<Container | (typeof node.children)[number]> =>
  node.children.flatMap(child => (child instanceof Container ? [child, ...descendants(child)] : [child]));

it('shares typed native values with shortcuts and applies callbacks once in declaration order', () => {
  const { scene } = createUIApp();
  const updates: Array<[string, unknown, unknown]> = [];
  const panel = demoPanel({
    scene,
    layout: 'bar',
    controls: {
      mode: choice('Mode', ['Normal', 'Screen']),
      amount: slider('Amount', { min: 0, max: 1, value: 0.5, step: 0.25 }),
      paused: toggle('Paused'),
    },
    onChange: (key, value, values) => updates.push([key, value, { ...values }]),
  });

  expect(panel.element).toBeInstanceOf(Panel);
  expect(panel.element.parent).toBe(scene.ui);
  expect(updates.map(([key, value]) => [key, value])).toEqual([
    ['mode', 'Normal'],
    ['amount', 0.5],
    ['paused', false],
  ]);
  expect(updates[0]![2]).toEqual({ mode: 'Normal', amount: 0.5, paused: false });
  const nodes = descendants(panel.element);
  const range = nodes.find(node => node instanceof Slider)!;
  const select = nodes.find(node => node instanceof Dropdown) as Dropdown<string>;
  const check = nodes.find(node => node instanceof Toggle)!;
  panel.set('amount', 0.25);
  expect(range.value).toBe(0.25);
  expect(updates).toHaveLength(4);
  range.value = 0.75;
  expect(panel.values.amount).toBe(0.75);
  expect(updates).toHaveLength(5);
  panel.step('mode', -1);
  expect(select.selectedValue).toBe('Screen');
  panel.step('paused');
  expect(check.checked).toBe(true);
  panel.step('amount', 10);
  expect(panel.values.amount).toBe(1);
  panel.dispose();
});

it('fits readable native controls in a scaled preview and keeps bottom lists on screen', () => {
  const { scene } = createUIApp();
  const canvas = scene.app.canvas as HTMLCanvasElement;
  vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({ height: 288 } as DOMRect);
  const panel = demoPanel({ scene, layout: 'bar', controls: { mode: choice('Mode', ['Normal', 'Screen']) } });
  panel.status('Ready');
  const viewport = panel.fit({ width: 1280, height: 720 }, canvas);
  expect(viewport).toMatchObject({ width: 512, height: 288, scale: 2.5, compact: true });
  expect(panel.element.uiWidth).toBe(512);
  expect(panel.element.uiHeight).toBeLessThan(160);
  expect(viewport.contentHeight).toBe(288 - panel.element.uiHeight);
  const dropdown = descendants(panel.element).find(node => node instanceof Dropdown) as Dropdown<string>;
  dropdown.open();
  expect(dropdown.listNode.y).toBeLessThan(0);
  const labels = panel.element.children.filter(node => node instanceof Label) as Label[];
  expect(labels.find(label => label.text === 'Ready')?.textNode.style.fontSize).toBeGreaterThanOrEqual(13);
  panel.dispose();
});

it('uses touch-sized controls and shows the three-parameter bar without clipping its rows', () => {
  vi.stubGlobal('matchMedia', () => ({ matches: true }));

  try {
    const { scene } = createUIApp();
    const canvas = scene.app.canvas as HTMLCanvasElement;
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({ height: 365 } as DOMRect);
    const panel = demoPanel({
      scene,
      layout: 'bar',
      controls: {
        enabled: toggle('Effect', true),
        strength: slider('Strength', { min: 0, max: 1, value: 0.8 }),
        separation: slider('Separation', { min: 0, max: 1, value: 0.2 }),
      },
    });
    const viewport = panel.fit({ width: 1280, height: 1200 }, canvas);
    const controls = descendants(panel.element).filter(node => node instanceof Slider || node instanceof Toggle);

    expect(controls).toHaveLength(3);
    expect(controls.every(control => control.uiHeight >= 44)).toBe(true);
    expect(viewport.contentHeight).toBeGreaterThan(120);
    expect(descendants(panel.element).find(node => node instanceof ScrollContainer)?.clip).toBe(false);
    panel.dispose();
  } finally {
    vi.unstubAllGlobals();
  }
});

it('owns action buttons and removes native controls and frame subscriptions on scene teardown', () => {
  const { scene } = createUIApp();
  const run = vi.fn();
  const panel = demoPanel({ scene, controls: {}, actions: { Restart: run } });
  expect(panel.actions.Restart).toBeInstanceOf(Button);
  panel.actions.Restart!.onClick.dispatch(panel.actions.Restart!);
  expect(run).toHaveBeenCalledTimes(1);
  const onFrame = scene.app.onFrame;
  scene._teardownInternals();
  expect(panel.element.destroyed).toBe(true);
  expect(() => panel.dispose()).not.toThrow();
  expect(onFrame.count).toBe(0);
});

it('paints the open choice above later choice rows and restores their document order when closed', () => {
  const { scene } = createUIApp();
  const panel = demoPanel({
    scene,
    controls: {
      backend: choice('Backend', ['WebGL2', 'WebGPU']),
      textures: choice('Textures', ['One atlas', 'Four textures']),
      count: slider('Sprites', { min: 100, max: 1000, value: 500, step: 100 }),
    },
  });
  panel.fit(scene.app, scene.app.canvas as HTMLCanvasElement);
  const choices = descendants(panel.element).filter(node => node instanceof Dropdown) as Array<Dropdown<string>>;
  const first = choices[0]!;
  const second = choices[1]!;
  const rows = first.parent!.parent!;

  first.open();
  expect(rows._childrenInPaintOrder().at(-1) === first.parent).toBe(true);
  first.close();
  second.open();
  expect(rows._childrenInPaintOrder().at(-1) === second.parent).toBe(true);
  second.close();
  expect(rows._childrenInPaintOrder()).toEqual(rows.children);
  first.open();
  const canvas = scene.app.canvas as HTMLCanvasElement;
  vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({ height: 180 } as DOMRect);
  panel.fit({ width: 1280, height: 720 }, canvas);
  expect(first.isOpen).toBe(false);
  expect(first.parent!.zIndex).toBe(0);
  panel.dispose();
});

it('keeps overflowing controls reachable in short previews and scrolls keyboard focus into view', () => {
  const { scene } = createUIApp();
  const canvas = scene.app.canvas as HTMLCanvasElement;
  vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({ height: 180 } as DOMRect);
  const panel = demoPanel({
    scene,
    controls: {
      one: toggle('One'),
      two: toggle('Two'),
      three: toggle('Three'),
      four: toggle('Four'),
      five: toggle('Five'),
    },
  });
  const viewport = panel.fit({ width: 1280, height: 720 }, canvas);
  expect(panel.element.uiHeight).toBeLessThanOrEqual(110);
  expect(viewport.contentHeight).toBeGreaterThanOrEqual(70);
  const scroll = descendants(panel.element).find(node => node instanceof ScrollContainer)!;
  const last = descendants(panel.element)
    .filter(node => node instanceof Toggle)
    .at(-1)!;
  last.onFocus.dispatch(last);
  expect(scroll.scrollY).toBeGreaterThan(0);
  const resize = vi.spyOn(scroll, 'setSize');
  panel.fit({ width: 1280, height: 720 }, canvas);
  expect(resize).not.toHaveBeenCalled();
  panel.dispose();
});

it('repaints a live status without rebuilding controls when its line count is unchanged', () => {
  const { scene } = createUIApp();
  const canvas = scene.app.canvas as HTMLCanvasElement;
  const panel = demoPanel({ scene, controls: { paused: toggle('Paused') } });
  panel.status('Ready');
  panel.fit(scene.app, canvas);
  const scroll = descendants(panel.element).find(node => node instanceof ScrollContainer)!;
  const resize = vi.spyOn(scroll, 'setSize');
  panel.status('Waiting', 'info');
  panel.fit(scene.app, canvas);
  expect(resize).not.toHaveBeenCalled();
  expect(descendants(panel.element).some(node => node instanceof Label && node.text === 'Waiting')).toBe(true);
  panel.dispose();
});

it('rejects an empty choice before attaching widgets or subscriptions', () => {
  const { scene } = createUIApp();
  const ui = scene.ui;
  expect(() => demoPanel({ scene, controls: { mode: choice<string>('Empty', [], 'none') } })).toThrow(RangeError);
  expect(ui.children).toHaveLength(0);
  expect(scene.app.onFrame.count).toBe(0);
});

it('preserves the bottom-left default away from the caption', () => {
  const { scene } = createUIApp();
  const panel = demoPanel({ scene, controls: {} });
  expect(panel.element.x).toBe(12);
  expect(panel.element.y).toBe(600 - panel.element.uiHeight - 12);
  panel.dispose();
});
