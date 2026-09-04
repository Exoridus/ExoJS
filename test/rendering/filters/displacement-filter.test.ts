import { describe, expect, test } from 'vitest';

import { Rectangle } from '#math/Rectangle';
import { DisplacementFilter } from '#rendering/filters/DisplacementFilter';
import { Texture } from '#rendering/texture/Texture';

const map = (): Texture => new Texture(document.createElement('canvas'));

const boundsOf = (filter: DisplacementFilter, input: Rectangle): readonly number[] => {
  const output = new Rectangle();

  filter.getOutputBounds(input, output);

  return [output.x, output.y, output.width, output.height];
};

describe('DisplacementFilter bounds', () => {
  test('reaches the largest displacement on every side', () => {
    const filter = new DisplacementFilter({ map: map(), scale: [30, 10] });

    expect(boundsOf(filter, new Rectangle(100, 100, 50, 20))).toEqual([70, 70, 110, 80]);
    filter.destroy();
  });

  test('a negative scale reaches as far as its magnitude', () => {
    const filter = new DisplacementFilter({ map: map(), scale: -8 });

    expect(boundsOf(filter, new Rectangle(0, 0, 10, 10))).toEqual([-8, -8, 26, 26]);
    filter.destroy();
  });

  test('scale 0 adds no reach', () => {
    const filter = new DisplacementFilter({ map: map(), scale: 0 });

    expect(boundsOf(filter, new Rectangle(5, 5, 10, 10))).toEqual([5, 5, 10, 10]);
    filter.destroy();
  });

  test('the reach follows the scale setters', () => {
    const filter = new DisplacementFilter({ map: map() });
    const input = new Rectangle(0, 0, 10, 10);

    expect(boundsOf(filter, input)).toEqual([-20, -20, 50, 50]);

    filter.scaleX = 4;
    filter.scaleY = 2;
    expect(boundsOf(filter, input)).toEqual([-4, -4, 18, 18]);

    filter.setScale([1, 6]);
    expect(boundsOf(filter, input)).toEqual([-6, -6, 22, 22]);
    filter.destroy();
  });
});

describe('DisplacementFilter options', () => {
  test('a single scale applies to both axes and the map offset defaults to zero', () => {
    const filter = new DisplacementFilter({ map: map(), scale: 7 });

    expect([filter.scaleX, filter.scaleY, filter.offsetU, filter.offsetV]).toEqual([7, 7, 0, 0]);
    filter.destroy();
  });

  test('the map offset round-trips through its accessors', () => {
    const filter = new DisplacementFilter({ map: map(), offset: [0.25, -0.5] });

    expect([filter.offsetU, filter.offsetV]).toEqual([0.25, -0.5]);

    filter.offsetU = 0.75;
    filter.offsetV = 0.125;
    expect([filter.offsetU, filter.offsetV]).toEqual([0.75, 0.125]);
    filter.destroy();
  });

  test('assigning a new map replaces the one the shader samples', () => {
    const first = map();
    const second = map();
    const filter = new DisplacementFilter({ map: first });

    filter.map = second;
    expect(filter.map).toBe(second);
    filter.destroy();
  });
});
