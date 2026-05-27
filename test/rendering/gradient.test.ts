import { Color } from '@/core/Color';
import { LinearGradient } from '@/rendering/gradient/LinearGradient';
import { RadialGradient } from '@/rendering/gradient/RadialGradient';
import { Sprite } from '@/rendering/sprite/Sprite';

describe('Gradient toTexture()', () => {
  test('requires at least 2 stops', () => {
    expect(() => new LinearGradient([{ offset: 0, color: Color.white }])).toThrow('Gradient requires at least 2 color stops.');
  });

  test('supports more than 8 stops and normalizes stop offsets', () => {
    const gradient = new LinearGradient([
      { offset: -0.5, color: Color.red },
      { offset: 0.1, color: Color.green },
      { offset: 0.2, color: Color.blue },
      { offset: 0.3, color: Color.white },
      { offset: 0.4, color: Color.black },
      { offset: 0.5, color: Color.cyan },
      { offset: 0.6, color: Color.magenta },
      { offset: 0.7, color: Color.yellow },
      { offset: 0.8, color: Color.gray },
      { offset: 1.7, color: Color.red },
    ]);

    const texture = gradient.toTexture(2, 1);

    expect(gradient.stops[0].offset).toBe(0);
    expect(gradient.stops[gradient.stops.length - 1].offset).toBe(1);
    expect(texture.buffer.length).toBe(8);
  });

  test('rasterizes linear gradients to rgba8', () => {
    const gradient = new LinearGradient(
      [
        { offset: 0, color: Color.red },
        { offset: 1, color: Color.blue },
      ],
      [0, 0],
      [1, 0],
    );

    const texture = gradient.toTexture(4, 1);

    expect(readPixel8(texture.buffer, 0)).toEqual([255, 0, 0, 255]);
    expect(readPixel8(texture.buffer, 3)).toEqual([0, 0, 255, 255]);

    const mid = readPixel8(texture.buffer, 1);

    expect(mid[0]).toBeGreaterThan(150);
    expect(mid[2]).toBeGreaterThan(70);
  });

  test('rasterizes radial gradients to rgba8', () => {
    const gradient = new RadialGradient(
      [
        { offset: 0, color: Color.white },
        { offset: 1, color: Color.black },
      ],
      [0.5, 0.5],
      0.5,
    );

    const texture = gradient.toTexture(5, 5);

    const center = readPixel8(texture.buffer, 12);
    const corner = readPixel8(texture.buffer, 0);

    expect(center[0]).toBeGreaterThan(corner[0]);
    expect(center[3]).toBe(255);
    expect(corner[3]).toBe(255);
  });

  test('supports rgba32f output', () => {
    const gradient = new LinearGradient(
      [
        { offset: 0, color: Color.red },
        { offset: 1, color: Color.blue },
      ],
      [0, 0],
      [1, 0],
    );

    const texture = gradient.toTexture(2, 1, { format: 'rgba32f' });

    expect(texture.format).toBe('rgba32f');
    expect(readPixel32(texture.buffer, 0)).toEqual([1, 0, 0, 1]);

    const right = readPixel32(texture.buffer, 1);

    expectNear(right[0], 0);
    expectNear(right[2], 1);
    expectNear(right[3], 1);
  });

  test('destroy releases internal stops', () => {
    const gradient = new LinearGradient([
      { offset: 0, color: Color.red },
      { offset: 1, color: Color.blue },
    ]);

    gradient.destroy();

    expect(gradient.stops).toHaveLength(0);
  });

  test('toTexture result keeps sprite bounds stable', () => {
    const gradient = new LinearGradient([
      { offset: 0, color: Color.red },
      { offset: 1, color: Color.blue },
    ]);
    const texture = gradient.toTexture(16, 8);
    const sprite = new Sprite(texture);

    expect(sprite.texture?.width).toBe(16);
    expect(sprite.texture?.height).toBe(8);

    sprite.setTexture(texture);

    expect(sprite.getLocalBounds().width).toBe(16);
    expect(sprite.getLocalBounds().height).toBe(8);
  });
});

const readPixel8 = (buffer: Uint8Array, index: number): readonly [number, number, number, number] => {
  const offset = index * 4;

  return [buffer[offset], buffer[offset + 1], buffer[offset + 2], buffer[offset + 3]];
};

const readPixel32 = (buffer: Float32Array, index: number): readonly [number, number, number, number] => {
  const offset = index * 4;

  return [buffer[offset], buffer[offset + 1], buffer[offset + 2], buffer[offset + 3]];
};

const expectNear = (actual: number, expected: number, epsilon = 0.001): void => {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(epsilon);
};
