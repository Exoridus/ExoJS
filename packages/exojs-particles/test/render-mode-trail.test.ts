import { Time } from '@codexo/exojs';
import { describe, expect, it } from 'vitest';

import { ParticleSystem } from '../src/ParticleSystem';
import { TrailParticles } from '../src/renderModes/TrailParticles';

/** Spawns `count` particles at the origin, all with the same long lifetime. */
const spawn = (system: ParticleSystem, count: number, lifetime = 100): void => {
  for (let i = 0; i < count; i++) {
    const slot = system._spawnSlot();

    system._storage.scaleX[slot] = 1;
    system._storage.scaleY[slot] = 1;
    system._storage.lifetime[slot] = lifetime;
  }
};

/** Moves every live particle by `(dx, dy)`, ages it by `dt`, then rebuilds. */
const step = (system: ParticleSystem, mode: TrailParticles, dx: number, dt: number): void => {
  const storage = system._storage;

  for (let i = 0; i < storage.count; i++) {
    storage.posX[i] = storage.posX[i]! + dx;
    storage.elapsed[i] = storage.elapsed[i]! + dt;
  }

  mode.build(system, storage);
};

/** One strip vertex, unpacked. */
const vertex = (mode: TrailParticles, index: number): { x: number; y: number; u: number; alpha: number } => {
  const floats = new Float32Array(mode.data);
  const words = new Uint32Array(mode.data);
  const offset = index * mode.floatsPerVertex;

  return { x: floats[offset]!, y: floats[offset + 1]!, u: floats[offset + 2]!, alpha: words[offset + 4]! >>> 24 };
};

describe('TrailParticles', () => {
  it('declares a non-instanced, CPU-only triangle-strip mode', () => {
    const mode = new TrailParticles();

    expect(mode.instanced).toBe(false);
    expect(mode.gpuEligible).toBe(false);
    expect(mode.dataLayout.topology).toBe('triangle-strip');
    expect(mode.dataLayout.stride).toBe(20);
  });

  it('forces the system onto the CPU path', () => {
    const system = new ParticleSystem({ capacity: 16, render: new TrailParticles() });

    expect(system.gpuMode).toBe(false);
  });

  it('emits nothing while a particle has not moved', () => {
    const system = new ParticleSystem({ capacity: 16 });
    const mode = new TrailParticles({ interval: 0.1 });

    spawn(system, 1);
    step(system, mode, 0, 0.1);

    expect(mode.count).toBe(0);
  });

  it('grows one strip pair per recorded position and caps it at the ring', () => {
    const system = new ParticleSystem({ capacity: 16 });
    const mode = new TrailParticles({ interval: 0.25, points: 4 });
    const counts: number[] = [];

    spawn(system, 1);
    mode.build(system, system._storage);

    for (let i = 0; i < 7; i++) {
      step(system, mode, 10, 0.125);
      counts.push(mode.count);
    }

    // One pair per position, so the strip widens every second frame here - and
    // on the frame a position is recorded it is still the live one, which is
    // why the count repeats rather than jumping by two. Four recorded
    // positions fill the ring, capping the strip at those plus the live head.
    expect(counts).toEqual([4, 4, 6, 6, 8, 8, 10]);
  });

  it('records on the particle clock rather than per frame', () => {
    const build = (frames: number, dt: number): number => {
      const system = new ParticleSystem({ capacity: 16 });
      const mode = new TrailParticles({ interval: 0.11, points: 8 });

      spawn(system, 1);
      mode.build(system, system._storage);

      for (let i = 0; i < frames; i++) {
        step(system, mode, 60 * dt, dt);
      }

      return mode.count;
    };

    // Half a second of the same travel either way, so both trails have to reach
    // back over the same recorded positions.
    const atSixty = build(30, 1 / 60);

    expect(atSixty).toBeGreaterThan(4);
    expect(build(15, 1 / 30)).toBe(atSixty);
  });

  it('runs the strip from the live position backwards through the recorded ones', () => {
    const system = new ParticleSystem({ capacity: 16 });
    const mode = new TrailParticles({ interval: 0.1, points: 4 });

    spawn(system, 1);
    mode.build(system, system._storage);
    step(system, mode, 10, 0.1);

    expect(mode.count).toBe(4);
    expect(vertex(mode, 0).x).toBeCloseTo(10);
    expect(vertex(mode, 2).x).toBeCloseTo(0);
  });

  it('straddles the path by half the width, scaled per particle', () => {
    const system = new ParticleSystem({ capacity: 16 });
    const mode = new TrailParticles({ interval: 0.1, points: 4, width: 4 });

    spawn(system, 1);
    mode.build(system, system._storage);
    system._storage.scaleX[0] = 0.5;
    step(system, mode, 10, 0.1);

    // The path runs from the particle back towards -X, so the pair straddles it
    // in Y by width * scaleX / 2.
    expect(vertex(mode, 0).y).toBeCloseTo(1);
    expect(vertex(mode, 1).y).toBeCloseTo(-1);
  });

  it('runs the trail UV by accumulated path length', () => {
    const system = new ParticleSystem({ capacity: 16 });
    const mode = new TrailParticles({ interval: 0.1, points: 4 });

    spawn(system, 1);
    mode.build(system, system._storage);
    step(system, mode, 10, 0.1);
    step(system, mode, 90, 0.1);

    // 90 units back to the previous recorded position, then 10 more to the one
    // before it.
    expect(vertex(mode, 0).u).toBeCloseTo(0);
    expect(vertex(mode, 2).u).toBeCloseTo(0.9);
    expect(vertex(mode, 4).u).toBeCloseTo(1);
  });

  it('fades the alpha from the particle towards the tail', () => {
    const system = new ParticleSystem({ capacity: 16 });
    const mode = new TrailParticles({ interval: 0.1, points: 4 });

    spawn(system, 1);
    system._storage.color[0] = 0xff112233;
    mode.build(system, system._storage);
    step(system, mode, 10, 0.1);

    expect(vertex(mode, 0).alpha).toBe(255);
    expect(vertex(mode, 2).alpha).toBe(0);
  });

  it('keeps a solid band when the fade is disabled', () => {
    const system = new ParticleSystem({ capacity: 16 });
    const mode = new TrailParticles({ interval: 0.1, points: 4, fade: 1 });

    spawn(system, 1);
    system._storage.color[0] = 0xff112233;
    mode.build(system, system._storage);
    step(system, mode, 10, 0.1);

    expect(vertex(mode, 0).alpha).toBe(255);
    expect(vertex(mode, 2).alpha).toBe(255);
  });

  it('separates two trails with a pair of degenerate vertices', () => {
    const system = new ParticleSystem({ capacity: 16 });
    const mode = new TrailParticles({ interval: 0.1, points: 4 });

    spawn(system, 2);
    system._storage.posY[1] = 100;
    mode.build(system, system._storage);
    step(system, mode, 10, 0.1);

    // Two four-vertex strips plus the two vertices that restart the second.
    expect(mode.count).toBe(10);
    // The restart repeats the last vertex of the first strip and the first of
    // the second, so both bridging triangles have zero area.
    expect(vertex(mode, 4)).toEqual(vertex(mode, 3));
    expect(vertex(mode, 5)).toEqual(vertex(mode, 6));
  });

  it('carries a trail into the slot a dead neighbour vacated', () => {
    const system = new ParticleSystem({ capacity: 16 });
    const mode = new TrailParticles({ interval: 0.1, points: 4 });

    spawn(system, 2);
    // Expires on the update below, so the second particle is compacted down
    // into slot 0 and inherits the history row of a dead one.
    system._storage.lifetime[0] = 0.15;
    system._storage.posY[1] = 100;

    mode.build(system, system._storage);
    step(system, mode, 10, 0.1);
    expect(mode.count).toBe(10);

    system.update(Time.seconds(0.1));
    expect(system.liveCount).toBe(1);

    step(system, mode, 10, 0.1);

    // One strip left, over three recorded positions: a history that had been
    // reset would be back to the single position a fresh particle starts with,
    // and would emit nothing.
    expect(mode.count).toBe(6);
    // Still the second particle's own path: it reaches back to where that one
    // spawned, offset in Y from the one that died.
    expect(vertex(mode, 4).x).toBeCloseTo(0);
    expect(vertex(mode, 4).y).toBeCloseTo(100.5);
  });
});
