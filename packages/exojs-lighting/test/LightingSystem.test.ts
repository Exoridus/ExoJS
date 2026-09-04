import { Color, TextureFormat } from '@codexo/exojs';
import { describe, expect, test } from 'vitest';

import { LightingSystem } from '../src/LightingSystem';
import { PointLight } from '../src/PointLight';

/** Row 1 starts one full texture row into the buffer. */
const secondRow = (system: LightingSystem): number => system.lightTexture.width * 4;

describe('LightingSystem', () => {
  test('allocates one rgba32f header column plus one column per light slot', () => {
    const system = new LightingSystem({ maxLights: 8 });

    expect(system.lightTexture.format).toBe(TextureFormat.Rgba32F);
    expect(system.lightTexture.width).toBe(9);
    expect(system.lightTexture.height).toBe(2);
    expect(system.lightTexture.buffer).toBeInstanceOf(Float32Array);
  });

  test('publishes the light count and the ambient term in the header column', () => {
    const system = new LightingSystem({ maxLights: 4, ambient: new Color(51, 102, 153) });

    system.add(new PointLight()).add(new PointLight());
    system.commit();

    const buffer = system.lightTexture.buffer;

    expect(buffer[0]).toBe(2);
    expect(system.activeLightCount).toBe(2);
    expect(buffer[secondRow(system)]).toBeCloseTo(51 / 255, 6);
    expect(buffer[secondRow(system) + 1]).toBeCloseTo(102 / 255, 6);
    expect(buffer[secondRow(system) + 2]).toBeCloseTo(153 / 255, 6);
  });

  test('packs position, radius and intensity in row 0 and normalized colour plus height in row 1', () => {
    const system = new LightingSystem({ maxLights: 4 });

    system.add(new PointLight({ x: 120, y: -35.5, radius: 400, intensity: 2.5, height: 96, color: new Color(255, 0, 128) }));
    system.commit();

    const buffer = system.lightTexture.buffer;
    const row0 = 4;
    const row1 = secondRow(system) + 4;

    expect(Array.from(buffer.subarray(row0, row0 + 4))).toEqual([120, -35.5, 400, 2.5]);
    expect(buffer[row1]).toBeCloseTo(1, 6);
    expect(buffer[row1 + 1]).toBe(0);
    expect(buffer[row1 + 2]).toBeCloseTo(128 / 255, 6);
    expect(buffer[row1 + 3]).toBe(96);
  });

  test('re-reads mutable light and ambient state on every commit', () => {
    const system = new LightingSystem({ maxLights: 2 });
    const light = new PointLight({ x: 1, y: 2 });

    system.add(light);
    system.commit();

    light.setPosition(300, 400);
    system.ambient.set(255, 255, 255);
    system.commit();

    expect(Array.from(system.lightTexture.buffer.subarray(4, 6))).toEqual([300, 400]);
    expect(system.lightTexture.buffer[secondRow(system)]).toBe(1);
  });

  test('publishes at most maxLights and recovers capacity when a light is removed', () => {
    const system = new LightingSystem({ maxLights: 2 });
    const first = new PointLight({ x: 1 });
    const surplus = new PointLight({ x: 3 });

    system
      .add(first)
      .add(new PointLight({ x: 2 }))
      .add(surplus);
    system.commit();

    expect(system.lights).toHaveLength(3);
    expect(system.activeLightCount).toBe(2);
    expect(system.lightTexture.buffer[0]).toBe(2);

    expect(system.remove(first)).toBe(true);
    expect(system.remove(first)).toBe(false);
    system.commit();

    expect(system.activeLightCount).toBe(2);
    expect(system.lightTexture.buffer[4]).toBe(2);
    expect(system.lightTexture.buffer[8]).toBe(3);
  });

  test('clear drops every light and publishes an empty header', () => {
    const system = new LightingSystem({ maxLights: 4 });

    system.add(new PointLight());
    system.clear().commit();

    expect(system.lights).toHaveLength(0);
    expect(system.lightTexture.buffer[0]).toBe(0);
  });

  test('the update phase commits, and every commit marks the texture for upload', () => {
    const system = new LightingSystem({ maxLights: 4 });
    const light = new PointLight();

    system.add(light);

    const before = system.lightTexture.version;

    light.setPosition(64, 64);
    system.update();

    expect(system.lightTexture.version).toBeGreaterThan(before);
    expect(Array.from(system.lightTexture.buffer.subarray(4, 6))).toEqual([64, 64]);
  });

  test('destroy releases the light texture and leaves the lights themselves alone', () => {
    const system = new LightingSystem({ maxLights: 4 });
    const light = new PointLight({ x: 5 });

    system.add(light);
    system.destroy();

    expect(system.lightTexture.destroyed).toBe(true);
    expect(system.lights).toHaveLength(0);
    expect(light.x).toBe(5);
  });
});
