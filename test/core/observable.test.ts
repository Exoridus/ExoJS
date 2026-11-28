import { isObservable, live, Observable, ObservableSize, ObservableVector, Rectangle, Size, Vector } from '@codexo/exojs';

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

  test('stay usable after a projection threw while connecting', () => {
    const value = new Observable(1);
    let fail = true;
    const doubled = value.map(n => {
      if (fail) {
        throw new Error('projection failed');
      }

      return n * 2;
    });

    expect(() => doubled.subscribe(() => undefined)).toThrow('projection failed');
    expect(value.subscriberCount).toBe(0);

    fail = false;
    const listener = vi.fn();

    doubled.subscribe(listener);
    value.value = 5;

    expect(listener).toHaveBeenCalledWith(10);
  });

  test('compute each projection of a chain once per change and reuse results on reads', () => {
    const value = new Observable(1);
    const counts = { a: 0, b: 0, c: 0 };
    const a = value.map(n => (counts.a++, n + 1));
    const b = a.map(n => (counts.b++, n * 2));
    const c = b.map(n => (counts.c++, `${n} pts`));
    const seen: string[] = [];

    c.subscribe(next => seen.push(next));
    expect(counts).toEqual({ a: 1, b: 1, c: 1 });

    value.value = 2;
    expect(counts).toEqual({ a: 2, b: 2, c: 2 });

    Observable.batch(() => {
      value.value = 3;
    });
    expect(counts).toEqual({ a: 3, b: 3, c: 3 });

    expect([a.value, b.value, c.value, c.value]).toEqual([4, 8, '8 pts', '8 pts']);
    expect(counts).toEqual({ a: 3, b: 3, c: 3 });
    expect(seen).toEqual(['6 pts', '8 pts']);
  });

  test('compute each value of a diamond once per change, from consistent sources', () => {
    const base = new Observable(1);
    const counts = { left: 0, right: 0, joined: 0 };
    const left = base.map(n => (counts.left++, n * 2));
    const right = base.map(n => (counts.right++, n * 3));
    const joined = live`${left}+${right}`.map(text => (counts.joined++, { text }));
    const seen: string[] = [];

    joined.subscribe(next => seen.push(next.text));
    left.subscribe(() => undefined);
    right.subscribe(() => undefined);
    counts.left = counts.right = counts.joined = 0;

    base.value = 2;
    expect(counts).toEqual({ left: 1, right: 1, joined: 1 });

    Observable.batch(() => {
      base.value = 3;
      base.value = 4;
    });
    expect(counts).toEqual({ left: 2, right: 2, joined: 2 });

    // An object result notifies once per recomputation, not once per changed source.
    expect(seen).toEqual(['4+6', '8+12']);
  });

  test('reuse the result while unobserved until a source changes or is marked changed', () => {
    const items = new Observable(['a']);
    let computes = 0;
    const count = items.map(list => (computes++, list.length));

    expect([count.value, count.value]).toEqual([1, 1]);
    expect(computes).toBe(1);

    items.value[0] = 'b';
    expect(count.value).toBe(1);
    expect(computes).toBe(1);

    items.mutate(list => list.push('c'));
    expect(count.value).toBe(2);
    expect(computes).toBe(2);
  });

  test('recompute on every read when a source cannot report changes while unobserved', () => {
    const position = new ObservableVector(null, 0, 1, 2);
    let computes = 0;
    const x = position.map(p => (computes++, p.x));

    expect([x.value, x.value]).toEqual([1, 1]);
    expect(computes).toBe(2);

    position.x = 5;
    expect(x.value).toBe(5);
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

describe('Observable.struct', () => {
  test('turns plain members into observables and keeps existing ones by identity', () => {
    const shared = new Observable(5);
    const derived = shared.map(n => n * 2);
    const position = new ObservableVector(null, 0, 1, 2);
    const size = new ObservableSize(() => undefined, 3, 4);
    const stats = Observable.struct({ ammo: 30, level: 1 });
    const player = Observable.struct({ name: 'Hero', health: 100, shared, derived, position, size, stats });

    expect(player.name).toBeInstanceOf(Observable);
    expect(player.name.value).toBe('Hero');
    expect(player.health.value).toBe(100);
    expect(player.shared).toBe(shared);
    expect(player.derived).toBe(derived);
    expect(player.position).toBe(position);
    expect(player.size).toBe(size);
    expect(player.stats).toBe(stats);

    player.health.value -= 10;
    player.stats.ammo.value--;

    expect([player.health.value, stats.ammo.value]).toEqual([90, 29]);
  });

  test('stores ordinary objects and arrays as single values, without traversing them', () => {
    const inventory = ['sword'];
    const settings = { volume: 0.5 };
    const player = Observable.struct({ inventory, settings });
    const listener = vi.fn();

    expect(player.inventory.value).toBe(inventory);
    expect(player.settings.value).toBe(settings);

    player.settings.subscribe(listener);
    settings.volume = 1;
    expect(listener).not.toHaveBeenCalled();

    player.settings.value = { volume: 1 };
    expect(listener).toHaveBeenCalledOnce();
  });

  test('leaves the members object untouched and returns a frozen record', () => {
    const members = { health: 100 };
    const player = Observable.struct(members);

    player.health.value = 1;

    expect(members).toEqual({ health: 100 });
    expect(Object.isFrozen(player)).toBe(true);
    expect(Object.keys(player)).toEqual(['health']);
    expect(isObservable(player)).toBe(false);
  });

  test('reserves no member names', () => {
    const odd = Observable.struct({ value: 1, subscribe: () => undefined, map: 'world' });

    expect(odd.value.value).toBe(1);
    expect(odd.map.value).toBe('world');
    expect(isObservable(odd)).toBe(false);
  });

  test('keeps symbol keys and __proto__ as ordinary members', () => {
    const id = Symbol('id');
    const hidden = Symbol('hidden');
    const members = { [id]: 7, ['__proto__']: 'proto' } as { [id]: number; __proto__: string };

    Object.defineProperty(members, hidden, { value: 1, enumerable: false });

    const struct = Observable.struct(members);

    expect(struct[id].value).toBe(7);
    expect(Object.getPrototypeOf(struct)).toBe(Object.prototype);
    expect(Object.hasOwn(struct, '__proto__')).toBe(true);
    expect((Object.getOwnPropertyDescriptor(struct, '__proto__')!.value as Observable<string>).value).toBe('proto');
    expect(Object.getOwnPropertySymbols(struct)).not.toContain(hidden);
    expect(Object.isFrozen(struct)).toBe(true);

    const parsed = Observable.struct(JSON.parse('{"__proto__": 1}') as object);

    expect(Object.keys(parsed)).toEqual(['__proto__']);
    expect(Object.getPrototypeOf(parsed)).toBe(Object.prototype);
  });

  test('shares one observable between structs', () => {
    const gold = new Observable(10);
    const a = Observable.struct({ gold });
    const b = Observable.struct({ gold, other: a });

    a.gold.value = 20;

    expect(b.gold.value).toBe(20);
    expect(b.other).toBe(a);
  });

  test('rejects members that are not a plain object', () => {
    expect(() => Observable.struct([1, 2])).toThrow(TypeError);
    expect(() => Observable.struct(new Vector(1, 2))).toThrow(TypeError);
  });
});

describe('Observable.batch', () => {
  test('applies writes immediately and notifies once with the final value', () => {
    const health = new Observable(100);
    const listener = vi.fn();

    health.subscribe(listener);
    Observable.batch(() => {
      health.value = 90;
      expect(health.value).toBe(90);
      health.value = 80;
      health.value = 70;
      expect(listener).not.toHaveBeenCalled();
    });

    expect(listener.mock.calls).toEqual([[70]]);
  });

  test('notifies a source written during the batch once, with its final value', () => {
    const value = new Observable(1);
    const listener = vi.fn();

    value.subscribe(listener);
    Observable.batch(() => {
      value.value = 2;
      value.value = 1;
    });

    expect(listener.mock.calls).toEqual([[1]]);
  });

  test('recomputes and applies a template over several changed sources once', () => {
    const player = Observable.struct({ health: 100, stats: Observable.struct({ ammo: 30, level: 1 }) });
    const compute = vi.fn((hp: number, ammo: number) => `HP: ${hp} | Ammo: ${ammo}`);
    const text = live`HP: ${player.health} | Ammo: ${player.stats.ammo}`;
    const writes: string[] = [];
    const counted = player.health.map(hp => compute(hp, player.stats.ammo.value));

    text.subscribe(next => writes.push(next));
    counted.subscribe(() => undefined);
    compute.mockClear();

    Observable.batch(() => {
      player.health.value = 50;
      player.stats.ammo.value = 10;
      player.stats.level.value++;
    });

    expect(writes).toEqual(['HP: 50 | Ammo: 10']);
    expect(compute).toHaveBeenCalledOnce();
  });

  test('never exposes an inconsistent intermediate derived value', () => {
    const a = new Observable(1);
    const b = new Observable(1);
    const sum = live`${a}+${b}=${a.map(x => x + b.value)}`;
    const seen: string[] = [];

    sum.subscribe(next => seen.push(next));
    Observable.batch(() => {
      a.value = 2;
      b.value = 3;
    });

    expect(seen).toEqual(['2+3=5']);
  });

  test('deduplicates derived chains with shared dependencies', () => {
    const base = new Observable(1);
    const doubled = base.map(n => n * 2);
    const tripled = base.map(n => n * 3);
    const total = live`${doubled} ${tripled} ${doubled.map(n => n + 1)}`;
    const seen: string[] = [];

    total.subscribe(next => seen.push(next));
    Observable.batch(() => {
      base.value = 2;
      base.value = 3;
    });

    expect(seen).toEqual(['6 9 7']);
  });

  test('computes a derived value once when it also depends on another derived value', () => {
    const source = new Observable(1);
    let computes = 0;
    const doubled = source.map(n => n * 2);
    const both = live`${source}|${doubled}`.map(text => {
      computes++;

      return text;
    });
    const seen: string[] = [];

    both.subscribe(next => seen.push(next));
    doubled.subscribe(() => undefined);
    computes = 0;

    Observable.batch(() => {
      source.value = 2;
    });

    expect(seen).toEqual(['2|4']);
    expect(computes).toBe(1);
  });

  test('preserves a spread copy of a struct like the struct itself', () => {
    const stats = Observable.struct({ ammo: 30 });
    const player = Observable.struct({ stats: { ...stats } });

    expect(player.stats.ammo).toBe(stats.ammo);
  });

  test('does not leak upstream subscriptions when connecting fails partway', () => {
    const a = new Observable(1);
    const flaky = {
      value: 2,
      subscribe: () => {
        throw new Error('subscribe failed');
      },
      map: () => flaky,
    } as unknown as Observable<number>;
    const text = live`${a}${flaky}`;

    expect(() => text.subscribe(() => undefined)).toThrow('subscribe failed');
    expect(a.subscriberCount).toBe(0);
  });

  test('nests, delivering only when the outermost batch completes', () => {
    const value = new Observable(0);
    const listener = vi.fn();

    value.subscribe(listener);
    Observable.batch(() => {
      value.value = 1;
      Observable.batch(() => {
        value.value = 2;
      });
      expect(listener).not.toHaveBeenCalled();
    });

    expect(listener.mock.calls).toEqual([[2]]);
  });

  test('delivers in first-change order and handles writes made by listeners in the same pass', () => {
    const a = new Observable(0);
    const b = new Observable(0);
    const order: string[] = [];

    b.subscribe(next => order.push(`b${next}`));
    a.subscribe(next => {
      order.push(`a${next}`);
      b.value = 10;
    });

    Observable.batch(() => {
      b.value = 1;
      a.value = 1;
    });

    expect(order).toEqual(['b1', 'a1', 'b10']);
  });

  test('keeps the writes and delivers their notifications when the callback throws', () => {
    const value = new Observable(0);
    const listener = vi.fn();

    value.subscribe(listener);

    expect(() =>
      Observable.batch(() => {
        value.value = 5;

        throw new Error('update failed');
      }),
    ).toThrow('update failed');

    expect(value.value).toBe(5);
    expect(listener).toHaveBeenCalledWith(5);
  });

  test('delivers every queued value when a listener throws, then rethrows the first error', () => {
    const a = new Observable(0);
    const b = new Observable(0);
    const late = vi.fn();

    a.subscribe(() => {
      throw new Error('listener failed');
    });
    b.subscribe(late);

    expect(() =>
      Observable.batch(() => {
        a.value = 1;
        b.value = 1;
      }),
    ).toThrow('listener failed');
    expect(late).toHaveBeenCalledWith(1);

    const after = vi.fn();
    b.subscribe(after);
    b.value = 2;
    expect(after).toHaveBeenCalledWith(2);
  });

  test('stops cycles that never settle', () => {
    const value = new Observable(0);

    value.subscribe(next => (value.value = next + 1));

    expect(() =>
      Observable.batch(() => {
        value.value = 1;
      }),
    ).toThrow(RangeError);
  });

  test('rejects asynchronous callbacks', () => {
    const value = new Observable(0);

    expect(() =>
      Observable.batch((async () => {
        value.value = 1;
      }) as unknown as () => void),
    ).toThrow(/must be synchronous/);
    expect(value.value).toBe(1);
  });

  test('applies unsubscriptions made during the delivery to later notifications', () => {
    const value = new Observable(0);
    const other = new Observable(0);
    const late = vi.fn();
    const stop = other.subscribe(late);

    value.subscribe(() => stop());
    Observable.batch(() => {
      value.value = 1;
      other.value = 1;
    });

    expect(late).not.toHaveBeenCalled();
  });

  test('defers vector subscribers but never the owner', () => {
    const changes: number[] = [];
    const vector = new ObservableVector({ _onObservableChange: channel => changes.push(channel) }, 3);
    const listener = vi.fn();

    vector.subscribe(listener);
    Observable.batch(() => {
      vector.x = 1;
      vector.y = 2;
      expect(changes).toEqual([3, 3]);
      expect(listener).not.toHaveBeenCalled();
    });

    expect(listener).toHaveBeenCalledOnce();
  });

  test('keeps notifications immediate outside batches and costs nothing for unobserved values', () => {
    const value = new Observable(0);

    Observable.batch(() => {
      value.value = 1;
    });

    const listener = vi.fn();
    value.subscribe(listener);
    value.value = 2;

    expect(listener).toHaveBeenCalledWith(2);
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

  test('ignores subscriptions to a destroyed vector or size', () => {
    const vector = new ObservableVector(null, 0);
    const size = new ObservableSize(() => undefined);
    const listener = vi.fn();

    vector.destroy();
    size.destroy();
    vector.subscribe(listener)();
    size.subscribe(listener);
    vector.x = 1;
    size.width = 1;

    expect(listener).not.toHaveBeenCalled();
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
