import { isObservable, live, Observable, ObservableObject, ObservableSize, ObservableVector, Rectangle, Size, Vector } from '@codexo/exojs';

describe('Observable', () => {
  test('notifies on change only, in subscription order, with the current value', () => {
    const health = new Observable(100);
    const calls: string[] = [];

    health.subscribe(value => calls.push(`a${value}`));
    health.subscribe(value => calls.push(`b${value}`));

    health.value -= 10;
    health.value = 90;
    health.value = 80;

    expect(calls).toEqual(['a90', 'b90', 'a80', 'b80']);
  });

  test('compares with Object.is', () => {
    const value = new Observable(Number.NaN);
    const listener = vi.fn();

    value.subscribe(listener);
    value.value = Number.NaN;
    expect(listener).not.toHaveBeenCalled();

    value.value = 0;
    value.value = -0;
    expect(listener).toHaveBeenCalledTimes(2);
  });

  test('notifies in-place object changes only when marked', () => {
    const inventory = new Observable<string[]>([]);
    const listener = vi.fn();

    inventory.subscribe(listener);
    const items = inventory.value;

    items.push('sword');
    inventory.value = items;
    expect(listener).not.toHaveBeenCalled();

    inventory.markChanged();
    inventory.mutate(items => items.push('shield'));

    expect(listener).toHaveBeenCalledTimes(2);
    expect(listener).toHaveBeenLastCalledWith(['sword', 'shield']);
  });

  test('unsubscribes deterministically and idempotently', () => {
    const value = new Observable(0);
    const listener = vi.fn();
    const unsubscribe = value.subscribe(listener);

    expect(value.subscriberCount).toBe(1);
    unsubscribe();
    unsubscribe();
    value.value = 1;

    expect(listener).not.toHaveBeenCalled();
    expect(value.subscriberCount).toBe(0);
  });

  test('delivers changes made by a listener as a new round, never out of order', () => {
    const value = new Observable(0);
    const seen: Array<[string, number]> = [];

    value.subscribe(next => {
      seen.push(['first', next]);

      if (next === 1) {
        value.value = 2;
      }
    });
    value.subscribe(next => seen.push(['second', next]));

    value.value = 1;

    expect(seen).toEqual([
      ['first', 1],
      ['second', 1],
      ['first', 2],
      ['second', 2],
    ]);
  });

  test('rejects listeners that never let the value settle', () => {
    const value = new Observable(0);

    value.subscribe(next => (value.value = next + 1));

    expect(() => (value.value = 1)).toThrow(RangeError);

    const listener = vi.fn();
    value.subscribe(listener);
    expect(value.subscriberCount).toBe(2);
  });

  test('applies subscriptions and unsubscriptions made during a notification to the next one', () => {
    const value = new Observable(0);
    const late = vi.fn();
    let unsubscribeSelf: () => void = () => undefined;
    const once = vi.fn(() => unsubscribeSelf());

    unsubscribeSelf = value.subscribe(once);
    value.subscribe(() => value.subscribe(late));

    value.value = 1;
    expect(late).not.toHaveBeenCalled();

    value.value = 2;
    expect(once).toHaveBeenCalledOnce();
    expect(late).toHaveBeenCalledWith(2);
  });

  test('destroy removes subscribers and ignores later subscriptions', () => {
    const value = new Observable(1);
    const listener = vi.fn();

    value.subscribe(listener);
    value.destroy();
    value.subscribe(listener)();
    value.value = 2;

    expect(value.value).toBe(2);
    expect(listener).not.toHaveBeenCalled();
  });
});

describe('derived values', () => {
  test('subscribe to their source only while observed', () => {
    const health = new Observable(100);
    const status = health.map(hp => (hp > 50 ? 'Healthy' : 'Wounded'));

    expect(status.value).toBe('Healthy');
    expect(health.subscriberCount).toBe(0);

    const listener = vi.fn();
    const unsubscribe = status.subscribe(listener);

    expect(health.subscriberCount).toBe(1);

    health.value = 90;
    health.value = 40;
    health.value = 30;

    expect(listener.mock.calls).toEqual([['Wounded']]);

    unsubscribe();
    expect(health.subscriberCount).toBe(0);

    health.value = 100;
    expect(status.value).toBe('Healthy');
  });

  test('always notify object results, which may have changed in place', () => {
    const items = new Observable<string[]>([]);
    const same = items.map(list => list);
    const listener = vi.fn();

    same.subscribe(listener);
    items.mutate(list => list.push('a'));
    items.markChanged();

    expect(listener).toHaveBeenCalledTimes(2);
  });

  test('share a source between independent observers', () => {
    const value = new Observable(1);
    const doubled = value.map(n => n * 2);
    const a = vi.fn();
    const b = vi.fn();
    const stopA = doubled.subscribe(a);

    doubled.subscribe(b);
    value.value = 2;
    stopA();
    value.value = 3;

    expect(a.mock.calls).toEqual([[4]]);
    expect(b.mock.calls).toEqual([[4], [6]]);
    expect(value.subscriberCount).toBe(1);
  });

  test('settle on consistent values when they depend on each other', () => {
    const a = new Observable(1);
    const text = live`${a} ${a.map(n => n * 2)}`;
    const seen: string[] = [];

    text.subscribe(next => seen.push(next));
    a.value = 2;

    expect(seen).toEqual(['2 4']);
  });

  test('chain lazily and disconnect the whole chain', () => {
    const value = new Observable(2);
    const label = value.map(n => n * 10).map(n => `${n} pts`);
    const unsubscribe = label.subscribe(() => undefined);

    expect(value.subscriberCount).toBe(1);
    unsubscribe();
    expect(value.subscriberCount).toBe(0);
  });

  test('keep their own subscribers when a source is destroyed', () => {
    const value = new Observable(1);
    const mapped = value.map(n => n + 1);
    const listener = vi.fn();

    mapped.subscribe(listener);
    value.destroy();
    value.value = 5;

    expect(listener).not.toHaveBeenCalled();
    expect(mapped.value).toBe(6);
  });
});

describe('ObservableObject', () => {
  interface PlayerStats {
    health: number;
    ammo: number;
    level: number;
  }

  test('exposes typed native properties that notify on change', () => {
    const stats = new ObservableObject<PlayerStats>({ health: 100, ammo: 30, level: 1 });
    const listener = vi.fn();

    ObservableObject.subscribe(stats, listener);

    stats.health -= 10;
    stats.ammo--;
    stats.level++;
    stats.level = 2;

    expect([stats.health, stats.ammo, stats.level]).toEqual([90, 29, 2]);
    expect(listener).toHaveBeenCalledTimes(3);
    expect(listener).toHaveBeenLastCalledWith(stats);
  });

  test('copies the initial object instead of observing it', () => {
    const initial = { health: 100 };
    const stats = new ObservableObject(initial);

    stats.health = 5;
    initial.health = 7;

    expect(initial.health).toBe(7);
    expect(stats.health).toBe(5);
    expect(stats).not.toBe(initial);
    expect(stats).toBeInstanceOf(ObservableObject);
  });

  test('reserves no data property names', () => {
    const settings = new ObservableObject({ value: 1, map: 'world', subscribe: true, markChanged: 0 });

    expect({ ...settings }).toEqual({ value: 1, map: 'world', subscribe: true, markChanged: 0 });
    expect(JSON.stringify(settings)).toBe('{"value":1,"map":"world","subscribe":true,"markChanged":0}');
    expect(isObservable(settings)).toBe(false);
  });

  test('keeps a fixed shape', () => {
    const stats = new ObservableObject({ health: 100 });

    expect(() => {
      (stats as Record<string, unknown>).mana = 5;
    }).toThrow(TypeError);
    expect(() => {
      delete (stats as Partial<typeof stats>).health;
    }).toThrow(TypeError);
  });

  test('observes shallowly and lets nested changes be marked', () => {
    const party = new ObservableObject({ members: ['Ann'] });
    const count = ObservableObject.map(party, p => p.members.length);
    const listener = vi.fn();

    count.subscribe(listener);
    party.members.push('Bo');
    expect(listener).not.toHaveBeenCalled();

    ObservableObject.markChanged(party);
    expect(listener).toHaveBeenCalledWith(2);
  });

  test('derives values lazily', () => {
    const stats = new ObservableObject({ health: 100, ammo: 30 });
    const summary = ObservableObject.map(stats, s => `${s.health} HP | ${s.ammo} Ammo`);
    const health = ObservableObject.map(stats, s => s.health);
    const seen: string[] = [];
    const healthListener = vi.fn();

    summary.subscribe(next => seen.push(next));
    health.subscribe(healthListener);

    stats.ammo = 29;
    stats.health = 90;

    expect(seen).toEqual(['100 HP | 29 Ammo', '90 HP | 29 Ammo']);
    expect(healthListener.mock.calls).toEqual([[90]]);
  });

  test('rejects values that are not plain objects, and sources that are not observable objects', () => {
    expect(() => new ObservableObject([1, 2])).toThrow(TypeError);
    expect(() => new ObservableObject(new Vector(1, 2))).toThrow(TypeError);
    expect(() => ObservableObject.map({ health: 1 }, s => s.health)).toThrow(/not an ObservableObject/);
  });
});

describe('live', () => {
  test('returns a plain string without observable substitutions', () => {
    const name = 'Hero';
    const result = live`Hello ${name}, level ${3}`;

    expect(result).toBe('Hello Hero, level 3');
  });

  test('keeps observable substitutions live and static ones as snapshots', () => {
    const health = new Observable(100);
    const ammo = new Observable(30);
    const max = { value: 30 };
    const text = live`HP ${health} | ${ammo} / ${max.value} | ${health}`;
    const seen: string[] = [];

    expect(text.value).toBe('HP 100 | 30 / 30 | 100');

    text.subscribe(next => seen.push(next));
    expect(health.subscriberCount).toBe(1);

    max.value = 99;
    health.value = 90;
    ammo.value = 29;

    expect(seen).toEqual(['HP 90 | 30 / 30 | 90', 'HP 90 | 29 / 30 | 90']);
  });

  test('renders vectors and sizes through their string form', () => {
    const position = new ObservableVector(null, 0, 120, 80);
    const size = new ObservableSize(() => undefined, 1920, 1080);
    const text = live`${position} @ ${size}`;
    const seen: string[] = [];

    text.subscribe(next => seen.push(next));
    position.x = 121;
    size.set(1280, 720);

    expect(seen).toEqual(['121, 80 @ 1920 × 1080', '121, 80 @ 1280 × 720']);
  });

  test('rejects functions and promises', () => {
    const health = new Observable(1);

    expect(() => live`${() => health.value}`).toThrow(/function/);
    expect(() => live`${Promise.resolve(1)}`).toThrow(/promise/);
  });
});

describe('vector and size observation', () => {
  class Owner {
    public readonly changes: number[] = [];

    public _onObservableChange(channel: number): void {
      this.changes.push(channel);
    }
  }

  test('notifies the owner first, then subscribers, and restores the owner afterwards', () => {
    const owner = new Owner();
    const vector = new ObservableVector(owner, 7, 0, 0);
    const before = Object.getOwnPropertyNames(vector).sort();
    const order: string[] = [];
    const unsubscribe = vector.subscribe(value => order.push(`observer ${value.x}`));

    vector.x = 5;
    vector.set(5, 0);
    vector.set(6, 6);

    expect(owner.changes).toEqual([7, 7]);
    expect(order).toEqual(['observer 5', 'observer 6']);

    unsubscribe();
    vector.x = 1;

    expect(owner.changes).toEqual([7, 7, 7]);
    expect(order).toHaveLength(2);
    expect(Object.getOwnPropertyNames(vector).sort()).toEqual(before);
    expect((vector as unknown as { _owner: unknown })._owner).toBe(owner);
  });

  test('maps a vector into derived text', () => {
    const vector = new ObservableVector(null, 0, 1.25, 2);
    const text = vector.map(p => `${p.x.toFixed(1)} | ${p.y.toFixed(1)}`);
    const listener = vi.fn();

    text.subscribe(listener);
    vector.x = 1.26;
    vector.y = 3;

    expect(listener.mock.calls).toEqual([['1.3 | 3.0']]);
  });

  test('ends observation when the vector or size is destroyed', () => {
    const vector = new ObservableVector(new Owner(), 0);
    const size = new ObservableSize(() => undefined);
    const vectorListener = vi.fn();
    const sizeListener = vi.fn();

    vector.subscribe(vectorListener);
    size.subscribe(sizeListener);
    vector.destroy();
    size.destroy();
    vector.x = 3;
    size.width = 3;

    expect(vectorListener).not.toHaveBeenCalled();
    expect(sizeListener).not.toHaveBeenCalled();
  });

  test('runs the size callback before subscribers and restores it afterwards', () => {
    const order: string[] = [];
    const callback = (): number => order.push('callback');
    const size = new ObservableSize(callback, 1, 1);
    const unsubscribe = size.subscribe(value => order.push(`observer ${String(value)}`));

    size.width = 2;
    unsubscribe();
    size.height = 2;

    expect(order).toEqual(['callback', 'observer 2 × 1', 'callback']);
    expect((size as unknown as { _callback: unknown })._callback).toBe(callback);
  });
});

describe('string representations', () => {
  test('use plain, unrounded, locale-independent numbers', () => {
    expect(String(new Vector(120, 80))).toBe('120, 80');
    expect(String(new Vector(0.1 + 0.2, -3))).toBe('0.30000000000000004, -3');
    expect(String(new ObservableVector(null, 0, 1, 2))).toBe('1, 2');
    expect(String(new Size(1920, 1080))).toBe('1920 × 1080');
    expect(String(new ObservableSize(() => undefined, 3, 4))).toBe('3 × 4');
    expect(String(new Rectangle(10, 20, 200, 100))).toBe('10, 20, 200, 100');
  });
});
