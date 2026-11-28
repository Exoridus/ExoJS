import { describe, test } from 'vitest';

import { live } from '../../src/core/live';
import { Observable } from '../../src/core/Observable';
import { ObservableVector, type ObservableVectorOwner } from '../../src/math/ObservableVector';
import { Container } from '../../src/rendering/Container';
import { benchRunOptions, benchTimeoutMs } from './runOptions';

const writes = 100_000;
const instances = 10_000;
let sink = 0;

const count = (): void => {
  sink++;
};

class CountingOwner implements ObservableVectorOwner {
  public changes = 0;

  public _onObservableChange(): void {
    this.changes++;
  }
}

describe('observable values', { timeout: benchTimeoutMs }, () => {
  test('writes (100k)', async ({ bench }) => {
    const plain = { health: 0 };
    const unobserved = new Observable(0);
    const observed = new Observable(0);
    const vector = new ObservableVector(new CountingOwner(), 0);
    const observedVector = new ObservableVector(new CountingOwner(), 0);

    observed.subscribe(count);
    observedVector.subscribe(count);

    await bench('plain property', () => {
      for (let i = 0; i < writes; i++) {
        plain.health = i;
      }
    }).run(benchRunOptions);
    await bench('Observable, unobserved', () => {
      for (let i = 0; i < writes; i++) {
        unobserved.value = i;
      }
    }).run(benchRunOptions);
    await bench('Observable, 1 listener', () => {
      for (let i = 0; i < writes; i++) {
        observed.value = i;
      }
    }).run(benchRunOptions);
    await bench('Observable, equal assignment', () => {
      for (let i = 0; i < writes; i++) {
        observed.value = 7;
      }
    }).run(benchRunOptions);
    await bench('ObservableVector.x, owner only', () => {
      for (let i = 0; i < writes; i++) {
        vector.x = i;
      }
    }).run(benchRunOptions);
    await bench('ObservableVector.x, owner + 1 listener', () => {
      for (let i = 0; i < writes; i++) {
        observedVector.x = i;
      }
    }).run(benchRunOptions);
  });

  test('construction (10k)', async ({ bench }) => {
    await bench('plain object', () => {
      for (let i = 0; i < instances; i++) {
        sink += { health: i, ammo: 30, level: 1 }.health;
      }
    }).run(benchRunOptions);
    await bench('Observable', () => {
      for (let i = 0; i < instances; i++) {
        sink += new Observable(i).value;
      }
    }).run(benchRunOptions);
    await bench('Observable.struct, 3 members', () => {
      for (let i = 0; i < instances; i++) {
        sink += Observable.struct({ health: i, ammo: 30, level: 1 }).health.value;
      }
    }).run(benchRunOptions);
    await bench('Container (4 observable vectors each)', () => {
      for (let i = 0; i < instances; i++) {
        new Container().destroy();
      }
    }).run(benchRunOptions);
  });

  test('fan-out and derived text (10k changes)', async ({ bench }) => {
    const fanned = new Observable(0);
    const health = new Observable(100);
    const ammo = new Observable(30);
    const text = live`HP ${health} | Ammo ${ammo} / 30`;
    const mapped = health.map(hp => (hp > 50 ? 'Healthy' : 'Wounded'));

    for (let i = 0; i < 100; i++) {
      fanned.subscribe(() => count());
    }

    text.subscribe(count);
    mapped.subscribe(count);

    await bench('100 listeners', () => {
      for (let i = 0; i < 10_000; i++) {
        fanned.value = i;
      }
    }).run(benchRunOptions);
    await bench('live text, 2 sources', () => {
      for (let i = 0; i < 10_000; i++) {
        health.value = i;
        ammo.value = i;
      }
    }).run(benchRunOptions);
    await bench('map with unchanged result', () => {
      for (let i = 0; i < 10_000; i++) {
        health.value = 100 + (i % 50);
      }
    }).run(benchRunOptions);
  });

  test('batching (10k rounds)', async ({ bench }) => {
    const player = Observable.struct({ health: 100, stats: Observable.struct({ ammo: 30, level: 1 }) });
    const text = live`HP: ${player.health} | Ammo: ${player.stats.ammo} | Lv ${player.stats.level}`;
    const vector = new ObservableVector(new CountingOwner(), 0);

    text.subscribe(count);
    vector.subscribe(count);

    await bench('3 writes, individual', () => {
      for (let i = 0; i < 10_000; i++) {
        player.health.value = i;
        player.stats.ammo.value = i;
        player.stats.level.value = i;
      }
    }).run(benchRunOptions);
    await bench('3 writes, batched', () => {
      for (let i = 0; i < 10_000; i++) {
        Observable.batch(() => {
          player.health.value = i + 1;
          player.stats.ammo.value = i + 1;
          player.stats.level.value = i + 1;
        });
      }
    }).run(benchRunOptions);
    await bench('10 writes to one value, batched', () => {
      for (let i = 0; i < 10_000; i++) {
        Observable.batch(() => {
          for (let j = 0; j < 10; j++) {
            player.health.value = i * 10 + j;
          }
        });
      }
    }).run(benchRunOptions);
    await bench('observed vector, batched set(x) + set(y)', () => {
      for (let i = 0; i < 10_000; i++) {
        Observable.batch(() => {
          vector.x = i;
          vector.y = i;
        });
      }
    }).run(benchRunOptions);
  });
});

export { sink };
