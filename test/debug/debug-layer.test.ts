/**
 * DebugLayer base-class tests - default viewMode and the no-op destroy(),
 * exercised through a minimal concrete subclass since DebugLayer itself is
 * abstract. Concrete layers (BoundingBoxesLayer, PerformanceLayer, ...) all
 * override viewMode/destroy, so the base implementations are otherwise
 * unreachable through the shipped layer set.
 */

import type { Application } from '#core/Application';
import type { Seconds } from '#core/units';
import { Time } from '#core/units';
import { DebugLayer } from '#debug/DebugLayer';
import type { RenderBackend } from '#rendering/RenderBackend';

class TestLayer extends DebugLayer {
  public updateCalls = 0;
  public renderCalls = 0;

  public override update(_delta: Seconds): void {
    this.updateCalls++;
  }

  public override render(_backend: RenderBackend): void {
    this.renderCalls++;
  }
}

const makeApp = () => ({}) as unknown as Application;

describe('DebugLayer', () => {
  test('visible defaults to false', () => {
    const layer = new TestLayer(makeApp());

    expect(layer.visible).toBe(false);
  });

  test('viewMode defaults to "screen" unless overridden', () => {
    const layer = new TestLayer(makeApp());

    expect(layer.viewMode).toBe('screen');
  });

  test('destroy() is a no-op by default', () => {
    const layer = new TestLayer(makeApp());

    expect(() => layer.destroy()).not.toThrow();
  });

  test('subclasses can implement update() and render()', () => {
    const layer = new TestLayer(makeApp());
    const fakeTime = Time.toSeconds(Time.milliseconds(16));

    layer.update(fakeTime);
    layer.render({} as unknown as RenderBackend);

    expect(layer.updateCalls).toBe(1);
    expect(layer.renderCalls).toBe(1);
  });
});
