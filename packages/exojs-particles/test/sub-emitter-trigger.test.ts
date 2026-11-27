import assert from 'node:assert/strict';

import { Texture, Time, Vector } from '@codexo/exojs';

import { Constant } from '#distributions/Constant';
import { BurstSpawn } from '#modules/BurstSpawn';
import { SpawnModule } from '#modules/SpawnModule';
import { SpawnOnDeath } from '#modules/SpawnOnDeath';
import type { ParticleEmitter } from '#ParticleStorage';
import { ParticleSystem } from '#ParticleSystem';

const emitDyingParticle = (system: ParticleSystem, x = 0, y = 0): void => {
  const particle = system.emit();

  assert.ok(particle);
  particle.position.set(x, y);
  particle.lifetime = 0.5;
};

const withSystems = (run: (parent: ParticleSystem, child: ParticleSystem) => void): void => {
  const texture = new Texture();
  const parent = new ParticleSystem(texture, { capacity: 20, simulation: 'cpu' });
  const child = new ParticleSystem(texture, { capacity: 100, simulation: 'cpu' });

  try {
    run(parent, child);
  } finally {
    parent.destroy();
    child.destroy();
    texture.destroy();
  }
};

describe('sub-emitter burst triggers', () => {
  test('emits a new one-shot burst on every actual particle death', () => {
    withSystems((parent, child) => {
      const burst = new BurstSpawn({ schedule: [{ time: 0, count: 2 }], lifetime: new Constant(100) });

      parent.addDeathModule(new SpawnOnDeath(child, burst));

      for (let death = 1; death <= 3; death++) {
        emitDyingParticle(parent);
        parent.update(Time.seconds(1));
        assert.equal(parent.liveCount, 0);
        assert.equal(child.liveCount, death * 2);
      }
    });
  });

  test('honors the invocation count for several deaths in the same frame', () => {
    withSystems((parent, child) => {
      const burst = new BurstSpawn({ schedule: [{ time: 0, count: 2 }], lifetime: new Constant(100) });

      parent.addDeathModule(new SpawnOnDeath(child, burst, 2));
      emitDyingParticle(parent);
      emitDyingParticle(parent);
      emitDyingParticle(parent);
      parent.update(Time.seconds(1));
      assert.equal(child.liveCount, 12);
    });
  });

  test('offsets only the particles emitted by each death', () => {
    withSystems((parent, child) => {
      const burst = new BurstSpawn({
        schedule: [{ time: 0, count: 1 }],
        position: new Constant(new Vector(2, 3)),
        lifetime: new Constant(100),
      });

      parent.addDeathModule(new SpawnOnDeath(child, burst));
      emitDyingParticle(parent, 10, 20);
      parent.update(Time.seconds(1));
      emitDyingParticle(parent, 30, 40);
      parent.update(Time.seconds(1));
      assert.equal(child.liveCount, 2);
      assert.deepEqual(Array.from(child._storage.posX.slice(0, 2)), [12, 32]);
      assert.deepEqual(Array.from(child._storage.posY.slice(0, 2)), [23, 43]);
    });
  });

  test('does not consume or reset the scheduled clock on an immediate trigger', () => {
    withSystems((parent, child) => {
      const burst = new BurstSpawn({
        schedule: [
          { time: 0, count: 1 },
          { time: 2, count: 3 },
        ],
        lifetime: new Constant(100),
      });

      burst.apply(child, 1);
      assert.equal(child.liveCount, 1);
      parent.addDeathModule(new SpawnOnDeath(child, burst));
      emitDyingParticle(parent);
      parent.update(Time.seconds(1));
      assert.equal(child.liveCount, 2);
      burst.apply(child, 1);
      assert.equal(child.liveCount, 5);
      emitDyingParticle(parent);
      parent.update(Time.seconds(1));
      assert.equal(child.liveCount, 6);
      burst.apply(child, 10);
      assert.equal(child.liveCount, 6);
    });
  });

  test('does not run delayed entries early', () => {
    withSystems((parent, child) => {
      const burst = new BurstSpawn({ schedule: [{ time: 2, count: 3 }], lifetime: new Constant(100) });

      parent.addDeathModule(new SpawnOnDeath(child, burst));
      emitDyingParticle(parent);
      parent.update(Time.seconds(1));
      assert.equal(child.liveCount, 0);
      burst.apply(child, 2);
      assert.equal(child.liveCount, 3);
    });
  });

  test('keeps the zero-delta default for custom subclasses', () => {
    class CustomSpawn extends SpawnModule {
      public readonly deltas: number[] = [];

      public override apply(emitter: ParticleEmitter, dt: number): void {
        this.deltas.push(dt);
        const particle = emitter.emit();

        if (particle !== null) {
          particle.lifetime = 100;
        }
      }
    }

    withSystems((parent, child) => {
      const spawner = new CustomSpawn();

      parent.addDeathModule(new SpawnOnDeath(child, spawner, 2));
      emitDyingParticle(parent);
      emitDyingParticle(parent);
      parent.update(Time.seconds(1));
      assert.equal(child.liveCount, 4);
      assert.deepEqual(spawner.deltas, [0, 0, 0, 0]);
    });
  });

  test('accepts structural custom spawn modules without an internal trigger', () => {
    withSystems((parent, child) => {
      const deltas: number[] = [];
      const spawner: SpawnModule = {
        apply(emitter, dt) {
          deltas.push(dt);
          const particle = emitter.emit();

          if (particle !== null) {
            particle.lifetime = 100;
          }
        },
        destroy() {},
      };

      parent.addDeathModule(new SpawnOnDeath(child, spawner));
      emitDyingParticle(parent);
      emitDyingParticle(parent);
      parent.update(Time.seconds(1));
      assert.equal(child.liveCount, 2);
      assert.deepEqual(deltas, [0, 0]);
    });
  });
});
