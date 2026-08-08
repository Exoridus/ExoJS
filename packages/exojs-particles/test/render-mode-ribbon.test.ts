import { describe, expect, it } from 'vitest';

import { ParticleSystem } from '../src/ParticleSystem';
import { RibbonParticles } from '../src/renderModes/RibbonParticles';

const spawnChain = (system: ParticleSystem, count: number): void => {
  for (let i = 0; i < count; i++) {
    const slot = system.spawn();

    system.posX[slot] = i * 10;
    system.posY[slot] = 0;
    system.scaleX[slot] = 1;
    system.scaleY[slot] = 1;
    system.lifetime[slot] = 5;
  }
};

describe('RibbonParticles', () => {
  it('declares a non-instanced, CPU-only triangle-strip mode', () => {
    const mode = new RibbonParticles();

    expect(mode.instanced).toBe(false);
    expect(mode.gpuEligible).toBe(false);
    expect(mode.geometry.topology).toBe('triangle-strip');
  });

  it('emits two vertices per particle', () => {
    const system = new ParticleSystem({ capacity: 16 });
    const mode = new RibbonParticles({ width: 4 });

    spawnChain(system, 5);
    mode.build(system);

    expect(mode.count).toBe(10);
  });

  it('emits nothing below two live particles', () => {
    const system = new ParticleSystem({ capacity: 16 });
    const mode = new RibbonParticles();

    spawnChain(system, 1);
    mode.build(system);

    expect(mode.count).toBe(0);
  });

  it('offsets the two vertices by half-width around the path', () => {
    const system = new ParticleSystem({ capacity: 16 });
    const mode = new RibbonParticles({ width: 4 });

    spawnChain(system, 2);
    mode.build(system);

    const floats = new Float32Array(mode.data);
    // Path runs along +X, so the pair straddles it in Y by half of width * scaleX.
    expect(floats[1]).toBeCloseTo(-2);
    expect(floats[1 + mode.floatsPerVertex]).toBeCloseTo(2);
  });

  it('runs the strip UV by accumulated path length rather than by index', () => {
    const system = new ParticleSystem({ capacity: 16 });
    const mode = new RibbonParticles();

    spawnChain(system, 3);
    // Uneven spacing: 10 units to the second particle, 90 to the third.
    system.posX[2] = 100;

    mode.build(system);

    const floats = new Float32Array(mode.data);
    const u = (particle: number): number => floats[particle * 2 * mode.floatsPerVertex + 2]!;

    expect(u(0)).toBeCloseTo(0);
    expect(u(1)).toBeCloseTo(0.1);
    expect(u(2)).toBeCloseTo(1);
  });

  it('runs the strip UV across the two sides of a pair', () => {
    const system = new ParticleSystem({ capacity: 16 });
    const mode = new RibbonParticles();

    spawnChain(system, 2);
    mode.build(system);

    const floats = new Float32Array(mode.data);

    expect(floats[3]).toBe(0);
    expect(floats[3 + mode.floatsPerVertex]).toBe(1);
  });

  it('copies the particle colour to both vertices of its pair', () => {
    const system = new ParticleSystem({ capacity: 16 });
    const mode = new RibbonParticles();

    spawnChain(system, 2);
    system.color[0] = 0xff0000ff;
    system.color[1] = 0xff00ff00;

    mode.build(system);

    const words = new Uint32Array(mode.data);

    expect(words[4]).toBe(0xff0000ff);
    expect(words[4 + mode.floatsPerVertex]).toBe(0xff0000ff);
    expect(words[4 + 2 * mode.floatsPerVertex]).toBe(0xff00ff00);
    expect(words[4 + 3 * mode.floatsPerVertex]).toBe(0xff00ff00);
  });

  it('tapers the half-width with the particle scale', () => {
    const system = new ParticleSystem({ capacity: 16 });
    const mode = new RibbonParticles({ width: 4 });

    spawnChain(system, 2);
    system.scaleX[1] = 0.5;

    mode.build(system);

    const floats = new Float32Array(mode.data);

    expect(floats[1]).toBeCloseTo(-2);
    expect(floats[1 + 2 * mode.floatsPerVertex]).toBeCloseTo(-1);
  });

  it('skips a leading particle whose neighbour is coincident with it', () => {
    const system = new ParticleSystem({ capacity: 16 });
    const mode = new RibbonParticles();

    spawnChain(system, 3);
    // The first two particles share a position, so the head has no direction
    // and no previous one to inherit.
    system.posX[1] = 0;

    mode.build(system);

    expect(mode.count).toBe(4);
  });

  it('forces the system onto the CPU path', () => {
    const system = new ParticleSystem({ capacity: 16, render: new RibbonParticles() });

    expect(system.gpuMode).toBe(false);
  });
});
