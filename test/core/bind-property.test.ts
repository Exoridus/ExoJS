import { bindProperty, Container, Label, live, Observable, ObservableVector, Sprite } from '@codexo/exojs';

const textWrites = (label: Label): { readonly count: () => number; readonly restore: () => void } => {
  const descriptor = Object.getOwnPropertyDescriptor(Label.prototype, 'text')!;
  let count = 0;

  Object.defineProperty(label, 'text', {
    configurable: true,
    get: () => descriptor.get!.call(label) as string,
    set: (value: string) => {
      count++;
      descriptor.set!.call(label, value);
    },
  });

  return { count: () => count, restore: () => delete (label as Partial<Label>).text };
};

import { useMockGlyphAtlas } from '../support/mock-glyph-atlas';

useMockGlyphAtlas();

class Gauge {
  public writes: unknown[] = [];
  private _value = 0;
  private _point: { x: number; y: number } | null = null;

  public get value(): number {
    return this._value;
  }

  public set value(value: number) {
    this.writes.push(value);
    this._value = value;
  }

  public get point(): { x: number; y: number } | null {
    return this._point;
  }

  public set point(point: { x: number; y: number } | null) {
    this.writes.push(point === null ? null : `${point.x},${point.y}`);
    this._point = point;
  }

  public get readOnly(): number {
    return 1;
  }
}

describe('bindProperty', () => {
  test('applies the initial value and every change through the setter until unbound', () => {
    const gauge = new Gauge();
    const level = new Observable(3);
    const unbind = bindProperty(gauge, 'value', level);

    level.value = 4;
    unbind();
    unbind();
    level.value = 5;

    expect(gauge.writes).toEqual([3, 4]);
    expect(gauge.value).toBe(4);
    expect(level.subscriberCount).toBe(0);
  });

  test('does not write unchanged derived results again', () => {
    const gauge = new Gauge();
    const health = new Observable(100);

    bindProperty(
      gauge,
      'value',
      health.map(hp => (hp > 50 ? 1 : 0)),
    );

    health.value = 90;
    health.value = 80;
    health.value = 10;

    expect(gauge.writes).toEqual([1, 0]);
  });

  test('re-applies a mutable object that changed in place', () => {
    const gauge = new Gauge();
    const point = new ObservableVector(null, 0, 1, 2);

    bindProperty(gauge, 'point', point);
    point.set(3, 4);

    expect(gauge.writes).toEqual(['1,2', '3,4']);
    expect(gauge.point).toBe(point);
  });

  test('keeps a manual write until the source changes again', () => {
    const gauge = new Gauge();
    const level = new Observable(1);

    bindProperty(gauge, 'value', level);
    gauge.value = 99;
    expect(gauge.value).toBe(99);

    level.value = 2;
    expect(gauge.value).toBe(2);
  });

  test('converts numbers for string properties only', () => {
    const label = new Label('');
    const health = new Observable(100);

    bindProperty(label, 'text', health);
    expect(label.text).toBe('100');

    health.value = 90;
    expect(label.text).toBe('90');

    label.destroy();
  });

  test('ends when the node, or an ancestor, is destroyed', () => {
    const health = new Observable(100);
    const parent = new Container();
    const label = new Label('');
    const sprite = new Sprite(null);

    parent.addChild(label);
    bindProperty(label, 'text', live`HP ${health}`);
    bindProperty(sprite, 'x', health);
    expect(health.subscriberCount).toBe(2);

    parent.destroy();
    sprite.destroy();
    health.value = 1;

    expect(health.subscriberCount).toBe(0);
    expect(label.text).toBe('HP 100');
  });

  test('leaves nothing subscribed for a destroyed node or a failed initial write', () => {
    const level = new Observable(1);
    const sprite = new Sprite(null);

    sprite.destroy();
    bindProperty(sprite, 'x', level)();
    expect(level.subscriberCount).toBe(0);

    expect(() => bindProperty(new Gauge() as unknown as { readOnly: number }, 'readOnly', level)).toThrow(TypeError);
    expect(level.subscriberCount).toBe(0);
  });

  test('writes a HUD label once per batch and never for unchanged text', () => {
    const player = Observable.struct({ health: 100, stats: Observable.struct({ ammo: 30, level: 1 }) });
    const label = new Label('');
    const writes = textWrites(label);

    bindProperty(label, 'text', live`HP: ${player.health} | Ammo: ${player.stats.ammo}`);
    expect(writes.count()).toBe(1);

    for (let i = 0; i < 10; i++) {
      Observable.batch(() => {
        player.health.value = 50 + i;
        player.stats.ammo.value = 20 + i;
        player.stats.level.value++;
      });
    }

    expect(writes.count()).toBe(11);
    expect(label.text).toBe('HP: 59 | Ammo: 29');

    player.stats.level.value++;
    Observable.batch(() => {
      player.health.value = 0;
      player.health.value = 59;
    });

    expect(writes.count()).toBe(11);

    writes.restore();
    label.destroy();
  });

  test('keeps independent bindings to a shared source apart across repeated construction', () => {
    const health = new Observable(100);
    const labels = Array.from({ length: 50 }, () => new Label(''));

    for (const label of labels) {
      bindProperty(label, 'text', health);
    }

    health.value = 7;
    expect(labels.every(label => label.text === '7')).toBe(true);

    for (const label of labels) {
      label.destroy();
    }

    expect(health.subscriberCount).toBe(0);
  });
});
