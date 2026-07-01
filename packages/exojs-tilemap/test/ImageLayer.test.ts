import { describe, expect, it } from 'vitest';

import { ImageLayer } from '../src/index';

describe('ImageLayer', () => {
  it('applies defaults for optional fields', () => {
    const layer = new ImageLayer({ id: 1, image: 'bg.png' });

    expect(layer.kind).toBe('image');
    expect(layer.id).toBe(1);
    expect(layer.name).toBe('');
    expect(layer.class).toBe('');
    expect(layer.image).toBe('bg.png');
    expect(layer.texture).toBeNull();
    expect(layer.visible).toBe(true);
    expect(layer.opacity).toBe(1);
    expect(layer.offsetX).toBe(0);
    expect(layer.offsetY).toBe(0);
    expect(layer.parallaxX).toBe(1);
    expect(layer.parallaxY).toBe(1);
    expect(layer.tintColor).toBeNull();
    expect(layer.repeatX).toBe(false);
    expect(layer.repeatY).toBe(false);
  });

  it('carries explicit construction options', () => {
    const layer = new ImageLayer({
      id: 2,
      name: 'Background',
      class: 'parallaxLayer',
      image: 'sky.png',
      visible: false,
      opacity: 0.5,
      offsetX: 8,
      offsetY: -4,
      parallaxX: 0.5,
      parallaxY: 0.25,
      tintColor: 0xff8800,
      repeatX: true,
      repeatY: true,
    });

    expect(layer.name).toBe('Background');
    expect(layer.class).toBe('parallaxLayer');
    expect(layer.image).toBe('sky.png');
    expect(layer.visible).toBe(false);
    expect(layer.opacity).toBe(0.5);
    expect(layer.offsetX).toBe(8);
    expect(layer.offsetY).toBe(-4);
    expect(layer.parallaxX).toBe(0.5);
    expect(layer.parallaxY).toBe(0.25);
    expect(layer.tintColor).toBe(0xff8800);
    expect(layer.repeatX).toBe(true);
    expect(layer.repeatY).toBe(true);
  });

  it('properties default to a frozen empty object', () => {
    const layer = new ImageLayer({ id: 1, image: 'bg.png' });

    expect(layer.properties).toEqual({});
    expect(Object.isFrozen(layer.properties)).toBe(true);
  });

  it('accepts a provided properties bag, copied and frozen', () => {
    const properties = { depth: 'far', parallax: true };
    const layer = new ImageLayer({ id: 1, image: 'bg.png', properties });

    expect(layer.properties).toEqual({ depth: 'far', parallax: true });
    expect(layer.properties).not.toBe(properties);
    expect(Object.isFrozen(layer.properties)).toBe(true);

    // Mutating the source object after construction must not affect the layer.
    (properties as Record<string, unknown>).depth = 'near';
    expect(layer.properties.depth).toBe('far');
  });
});
