import { describe, test } from 'vitest';

import { live } from '../../src/core/live';
import { Observable } from '../../src/core/Observable';
import { ObservableObject } from '../../src/core/ObservableObject';
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
    const object = new ObservableObject({ health: 0, ammo: 0 });
    const observedObject = new ObservableObject({ health: 0, ammo: 0 });
    const vector = new ObservableVector(new CountingOwner(), 0);
    const observedVector = new ObservableVector(new CountingOwner(), 0);

    observed.subscribe(count);
    ObservableObject.subscribe(observedObject, count);
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
    await bench('ObservableObject property, unobserved', () => {
      for (let i = 0; i < writes; i++) {
        object.health = i;
      }
    }).run(benchRunOptions);
    await bench('ObservableObject property, 1 listener', () => {
      for (let i = 0; i < writes; i++) {
        observedObject.health = i;
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
    await bench('ObservableObject, 3 properties', () => {
      for (let i = 0; i < instances; i++) {
        sink += new ObservableObject({ health: i, ammo: 30, level: 1 }).health;
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
});

export { sink };
