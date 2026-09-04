import { describe, expect, test } from 'vitest';

import { Color } from '#core/Color';
import { Rectangle } from '#math/Rectangle';
import { DropShadowFilter } from '#rendering/filters/DropShadowFilter';

describe('DropShadowFilter bounds', () => {
  test('reports the union of the source and the blurred, offset shadow', () => {
    const filter = new DropShadowFilter({ offsetX: 10, offsetY: -6, blur: 3 });
    const output = new Rectangle();

    filter.getOutputBounds(new Rectangle(100, 100, 50, 20), output);

    expect([output.x, output.y, output.width, output.height]).toEqual([100, 91, 63, 29]);
    filter.destroy();
  });

  test('a shadow without offset or blur adds no reach', () => {
    const filter = new DropShadowFilter({ offsetX: 0, offsetY: 0, blur: 0 });
    const output = new Rectangle();

    filter.getOutputBounds(new Rectangle(5, 5, 10, 10), output);

    expect([output.x, output.y, output.width, output.height]).toEqual([5, 5, 10, 10]);
    filter.destroy();
  });

  test('setters copy the colour and clamp blur and quality like BlurFilter', () => {
    const filter = new DropShadowFilter();
    const color = new Color(10, 20, 30, 0.25);

    filter.color = color;
    color.r = 200;
    expect(filter.color.r).toBe(10);

    filter.blur = -1;
    expect(filter.blur).toBe(0);
    filter.quality = 2.7;
    expect(filter.quality).toBe(2);
    filter.destroy();
    color.destroy();
  });
});
