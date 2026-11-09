import assert from 'node:assert/strict';

import { Texture, Time } from '@codexo/exojs';

import { Constant } from '#distributions/Constant';
import { BurstSpawn } from '#modules/BurstSpawn';
import { ParticleSystem } from '#ParticleSystem';

describe('overlapping burst schedules', () => {
  for (const interval of [0.5, 1, 2, 3]) {
    for (const step of [0.25, 1, 4]) {
      test(`matches absolute event times for interval=${interval}, step=${step}`, () => {
        const texture = new Texture();
        const system = new ParticleSystem(texture, { capacity: 1000, simulation: 'cpu' });
        const schedule = [{ time: 0, count: 1 }, { time: 2, count: 2 }];

        try {
          system.addSpawnModule(new BurstSpawn({ schedule, interval, lifetime: new Constant(100) }));
          system.update(Time.seconds(0));

          for (let time = step; time <= 4; time += step) {
            system.update(Time.seconds(step));
            let expected = 0;

            for (let cycle = 0; cycle * interval <= time; cycle++) {
              for (const entry of schedule) {
                if (cycle * interval + entry.time <= time) {
                  expected += entry.count;
                }
              }
            }

            assert.equal(system.liveCount, expected, `time=${time}`);
            system.update(Time.seconds(0));
            assert.equal(system.liveCount, expected, 'zero dt must not repeat consumed events');
          }
        } finally {
          system.destroy();
          texture.destroy();
        }
      });
    }
  }

  test('restarts every entry on reset, including a still-pending delayed burst', () => {
    const texture = new Texture();
    const system = new ParticleSystem(texture, { capacity: 100, simulation: 'cpu' });
    const burst = new BurstSpawn({
      schedule: [{ time: 0, count: 1 }, { time: 2, count: 2 }],
      interval: 1,
      lifetime: new Constant(100),
    });

    try {
      system.addSpawnModule(burst);
      system.update(Time.seconds(1));
      assert.equal(system.liveCount, 2);
      system.clearParticles();
      burst.reset();
      system.update(Time.seconds(0));
      assert.equal(system.liveCount, 1);
      system.update(Time.seconds(2));
      assert.equal(system.liveCount, 5);
    } finally {
      system.destroy();
      texture.destroy();
    }
  });

  test('consumes missed events at capacity instead of replaying them later', () => {
    const texture = new Texture();
    const system = new ParticleSystem(texture, { capacity: 2, simulation: 'cpu' });

    try {
      system.addSpawnModule(
        new BurstSpawn({
          schedule: [{ time: 0, count: 1 }, { time: 2, count: 1 }],
          interval: 1,
          lifetime: new Constant(100),
        }),
      );
      system.update(Time.seconds(4));
      assert.equal(system.liveCount, 2);
      system.clearParticles();
      system.update(Time.seconds(0));
      assert.equal(system.liveCount, 0);
      system.update(Time.seconds(1));
      assert.equal(system.liveCount, 2);
    } finally {
      system.destroy();
      texture.destroy();
    }
  });

  test('keeps non-repeating intervals one-shot', () => {
    for (const interval of [undefined, 0, -1, Infinity, NaN]) {
      const texture = new Texture();
      const system = new ParticleSystem(texture, { capacity: 100, simulation: 'cpu' });

      try {
        system.addSpawnModule(
          new BurstSpawn({
            schedule: [{ time: 0, count: 2 }, { time: 2, count: 3 }],
            interval,
            lifetime: new Constant(100),
          }),
        );
        system.update(Time.seconds(4));
        system.update(Time.seconds(4));
        assert.equal(system.liveCount, 5);
      } finally {
        system.destroy();
        texture.destroy();
      }
    }
  });

  test('does not miss a decimal interval boundary after accumulated updates', () => {
    for (const steps of [[0, 0.3], [0.1, 0.1, 0.1]]) {
      const texture = new Texture();
      const system = new ParticleSystem(texture, { capacity: 100, simulation: 'cpu' });

      try {
        system.addSpawnModule(
          new BurstSpawn({
            schedule: [{ time: 0, count: 1 }, { time: 0.2, count: 2 }],
            interval: 0.1,
            lifetime: new Constant(100),
          }),
        );

        for (const step of steps) {
          system.update(Time.seconds(step));
        }

        assert.equal(system.liveCount, 8);
        system.update(Time.seconds(0));
        assert.equal(system.liveCount, 8);
      } finally {
        system.destroy();
        texture.destroy();
      }
    }
  });
});
