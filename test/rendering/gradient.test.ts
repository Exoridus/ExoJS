import { Color } from '@/core/Color';
import { Drawable } from '@/rendering/Drawable';
import { Mesh } from '@/rendering/mesh/Mesh';
import { GradientDrawable } from '@/rendering/primitives/Gradient';

const createStops = () => [
  { offset: 0, color: Color.red },
  { offset: 1, color: Color.blue },
];

describe('GradientDrawable', () => {
  test('is a Drawable mesh primitive', () => {
    const gradient = new GradientDrawable({
      width: 120,
      height: 60,
      stops: createStops(),
    });

    expect(gradient).toBeInstanceOf(Drawable);
    expect(gradient).toBeInstanceOf(Mesh);
  });

  test('rejects invalid stop counts', () => {
    expect(() => new GradientDrawable({ width: 10, height: 10, stops: [{ offset: 0, color: Color.white }] })).toThrow(
      'GradientDrawable requires at least 2 color stops.',
    );

    expect(
      () =>
        new GradientDrawable({
          width: 10,
          height: 10,
          stops: [
            { offset: 0, color: Color.white },
            { offset: 0.1, color: Color.black },
            { offset: 0.2, color: Color.red },
            { offset: 0.3, color: Color.green },
            { offset: 0.4, color: Color.blue },
            { offset: 0.5, color: Color.cyan },
            { offset: 0.6, color: Color.yellow },
            { offset: 0.7, color: Color.magenta },
            { offset: 1, color: Color.gray },
          ],
        }),
    ).toThrow('GradientDrawable supports at most 8 color stops.');
  });

  test('normalizes stop offsets into ascending 0..1 range', () => {
    const gradient = new GradientDrawable({
      width: 32,
      height: 16,
      stops: [
        { offset: 1.4, color: Color.blue },
        { offset: -0.3, color: Color.red },
      ],
    });

    expect(gradient.stops[0].offset).toBe(0);
    expect(gradient.stops[1].offset).toBe(1);
  });

  test('setSize updates bounds', () => {
    const gradient = new GradientDrawable({
      width: 20,
      height: 30,
      stops: createStops(),
    });

    gradient.setSize(80, 40);

    expect(gradient.width).toBe(80);
    expect(gradient.height).toBe(40);
    expect(gradient.getLocalBounds().width).toBe(80);
    expect(gradient.getLocalBounds().height).toBe(40);
  });

  test('switches between linear and radial modes', () => {
    const gradient = new GradientDrawable({
      width: 40,
      height: 40,
      stops: createStops(),
    });

    gradient.setRadial(0.5, 0.5, 0.5);
    expect(gradient.mode).toBe('radial');

    gradient.setLinear(0, 0, 1, 1);
    expect(gradient.mode).toBe('linear');
  });
});
