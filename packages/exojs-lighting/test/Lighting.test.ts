import { Color, Container, TextureFormat } from '@codexo/exojs';
import { describe, expect, test } from 'vitest';

import type { ForwardBackend } from '../src/backends/ForwardBackend';
import { Lighting } from '../src/Lighting';
import { PointLight } from '../src/lights/PointLight';
import { SpotLight } from '../src/lights/SpotLight';

const channels = 4;

/** The packed texture the forward renderer publishes into. */
const textureOf = (lighting: Lighting): (typeof ForwardBackend.prototype)['lightTexture'] => (lighting.backend as ForwardBackend).lightTexture;

/** Byte offset of light `index`'s slot in row `row`. */
const slot = (lighting: Lighting, row: number, index: number): number => (textureOf(lighting).width * row + index + 1) * channels;

describe('Lighting', () => {
  test('allocates one header column plus one column per light slot, three rows deep', () => {
    const lighting = new Lighting({ maxLights: 8 });
    const texture = textureOf(lighting);

    expect(texture.format).toBe(TextureFormat.Rgba32F);
    expect(texture.width).toBe(9);
    expect(texture.height).toBe(3);
  });

  test('publishes the light count and the ambient term in the header column', () => {
    const lighting = new Lighting({ maxLights: 4, ambient: new Color(51, 102, 153) });

    lighting.add(new PointLight());
    lighting.add(new PointLight());
    lighting.update();

    const buffer = textureOf(lighting).buffer;

    expect(buffer[0]).toBe(2);
    expect(lighting.activeLightCount).toBe(2);
    expect(buffer[textureOf(lighting).width * channels]).toBeCloseTo(51 / 255, 6);
  });

  test('a light publishes the world position its transform gives it', () => {
    const lighting = new Lighting({ maxLights: 2 });
    const carrier = new Container().setPosition(300, 120);
    const light = lighting.add(new PointLight({ radius: 90 }));

    carrier.addChild(light.setPosition(20, 5));
    lighting.update();

    const buffer = textureOf(lighting).buffer;
    const offset = slot(lighting, 0, 0);

    expect(buffer[offset]).toBeCloseTo(320, 5);
    expect(buffer[offset + 1]).toBeCloseTo(125, 5);
    expect(buffer[offset + 2]).toBe(90);
  });

  test('a disabled light and one without intensity are skipped, and the rest close the gap', () => {
    const lighting = new Lighting({ maxLights: 4 });

    lighting.add(new PointLight({ enabled: false, radius: 10 }));
    lighting.add(new PointLight({ intensity: 0, radius: 20 }));
    lighting.add(new PointLight({ radius: 30 }));
    lighting.update();

    const buffer = textureOf(lighting).buffer;

    expect(lighting.activeLightCount).toBe(1);
    expect(buffer[0]).toBe(1);
    expect(buffer[slot(lighting, 0, 0) + 2]).toBe(30);
  });

  test('lights beyond the renderer capacity are dropped rather than overwriting the last slot', () => {
    const lighting = new Lighting({ maxLights: 2 });

    lighting.add(new PointLight({ radius: 1 }));
    lighting.add(new PointLight({ radius: 2 }));
    lighting.add(new PointLight({ radius: 3 }));
    lighting.update();

    const buffer = textureOf(lighting).buffer;

    expect(lighting.activeLightCount).toBe(2);
    expect(buffer[slot(lighting, 0, 1) + 2]).toBe(2);
  });

  test('a point light writes a cone no direction can fail', () => {
    const lighting = new Lighting({ maxLights: 1 });

    lighting.add(new PointLight());
    lighting.update();

    const buffer = textureOf(lighting).buffer;
    const cone = slot(lighting, 2, 0);

    expect(buffer[cone + 2]).toBe(-1);
    expect(buffer[cone + 3]).toBe(-1);
  });

  test('a spot light aims along its own rotation and fades across softness', () => {
    const lighting = new Lighting({ maxLights: 1 });
    const spot = lighting.add(new SpotLight({ angle: 60, softness: 0.5 }));

    // Unrotated, the cone points along the node's local +x.
    lighting.update();
    expect(textureOf(lighting).buffer[slot(lighting, 2, 0)]).toBeCloseTo(1, 5);

    // Rotation is in degrees, and the cone turns with the node - a quarter turn
    // lands the axis on the engine's -y, which is up the screen.
    spot.rotation = 90;
    lighting.update();

    const buffer = textureOf(lighting).buffer;
    const cone = slot(lighting, 2, 0);

    expect(buffer[cone]).toBeCloseTo(0, 5);
    expect(buffer[cone + 1]).toBeCloseTo(-1, 5);
    // Outer edge at 60 degrees, inner edge at 30 - the fade starts halfway in.
    expect(buffer[cone + 2]).toBeCloseTo(Math.cos((60 * Math.PI) / 180), 5);
    expect(buffer[cone + 3]).toBeCloseTo(Math.cos((30 * Math.PI) / 180), 5);
  });

  test('a hard-edged spot collapses both cone cosines onto one value', () => {
    const lighting = new Lighting({ maxLights: 1 });

    lighting.add(new SpotLight({ angle: 45, softness: 0 }));
    lighting.update();

    const buffer = textureOf(lighting).buffer;
    const cone = slot(lighting, 2, 0);

    expect(buffer[cone + 2]).toBeCloseTo(buffer[cone + 3]!, 6);
  });

  test('registering a light twice shades it once', () => {
    const lighting = new Lighting({ maxLights: 4 });
    const light = new PointLight();

    lighting.add(light);
    lighting.add(light);
    lighting.update();

    expect(lighting.lights).toHaveLength(1);
    expect(lighting.activeLightCount).toBe(1);
  });

  test('registering with a second system moves the light rather than shading it twice', () => {
    const first = new Lighting({ maxLights: 4 });
    const second = new Lighting({ maxLights: 4 });
    const light = new PointLight();

    first.add(light);
    second.add(light);

    expect(first.lights).toHaveLength(0);
    expect(second.lights).toHaveLength(1);
  });

  test('destroying a registered light unregisters it', () => {
    const lighting = new Lighting({ maxLights: 4 });
    const light = lighting.add(new PointLight());

    light.destroy();

    expect(lighting.lights).toHaveLength(0);
  });

  test('destroying the system unregisters its lights without destroying them', () => {
    const lighting = new Lighting({ maxLights: 4 });
    const light = lighting.add(new PointLight());

    lighting.destroy();

    expect(lighting.lights).toHaveLength(0);
    expect(light.destroyed).toBe(false);
  });
});
