import { Color } from '@/core/Color';
import { LinearGradient } from '@/rendering/gradient/LinearGradient';
import { RadialGradient } from '@/rendering/gradient/RadialGradient';
import { Graphics } from '@/rendering/primitives/Graphics';
import { DataTexture } from '@/rendering/texture/DataTexture';

const createLinearGradient = (): LinearGradient =>
  new LinearGradient(
    [
      { offset: 0, color: Color.red },
      { offset: 1, color: Color.blue },
    ],
    [0, 0],
    [1, 0],
  );

describe('Graphics', () => {
  test('drawArc appends a path and updates current point', () => {
    const graphics = new Graphics();

    graphics.lineWidth = 2;
    graphics.drawArc(0, 0, 10, 0, Math.PI / 2, false);

    expect(graphics.children.length).toBe(1);
    expect(graphics.currentPoint.x).toBeCloseTo(0, 4);
    expect(graphics.currentPoint.y).toBeCloseTo(10, 4);
  });

  test('arcTo creates a connecting segment + arc and updates current point', () => {
    const graphics = new Graphics();

    graphics.lineWidth = 2;
    graphics.moveTo(0, 0);
    graphics.arcTo(10, 0, 10, 10, 2);

    expect(graphics.children.length).toBeGreaterThanOrEqual(2);
    expect(graphics.currentPoint.x).toBeCloseTo(10, 4);
    expect(graphics.currentPoint.y).toBeCloseTo(2, 4);
  });

  describe('gradient paints', () => {
    test('fillGradient defaults to null and is cloned on assignment', () => {
      const graphics = new Graphics();
      const gradient = createLinearGradient();

      expect(graphics.fillGradient).toBeNull();

      graphics.fillGradient = gradient;

      expect(graphics.fillGradient).not.toBeNull();
      expect(graphics.fillGradient).not.toBe(gradient);
      expect(graphics.fillGradient!.equals(gradient)).toBe(true);
    });

    test('filling with a gradient builds a textured mesh with bounding-box UVs', () => {
      const graphics = new Graphics();

      graphics.fillGradient = createLinearGradient();
      graphics.drawRectangle(0, 0, 20, 10);

      const mesh = graphics.getChildAt(0);

      expect(mesh.texture).toBeInstanceOf(DataTexture);
      expect(mesh.uvs).not.toBeNull();
      // Rectangle corners (TL, TR, BL, BR) map to the unit UV square.
      expect(Array.from(mesh.uvs!)).toEqual([0, 0, 1, 0, 0, 1, 1, 1]);
      // White tint leaves the sampled gradient unmodulated.
      expect(mesh.tint.equals(Color.white)).toBe(true);
    });

    test('repeated fills with the same gradient share one rasterized texture', () => {
      const graphics = new Graphics();

      graphics.fillGradient = createLinearGradient();
      graphics.drawRectangle(0, 0, 10, 10);
      graphics.drawCircle(40, 40, 8);

      const first = graphics.getChildAt(0).texture;
      const second = graphics.getChildAt(1).texture;

      expect(first).toBeInstanceOf(DataTexture);
      expect(second).toBe(first);
    });

    test('setting fillColor reverts to the solid-color path', () => {
      const graphics = new Graphics();

      graphics.fillGradient = createLinearGradient();
      graphics.fillColor = new Color(10, 20, 30);
      graphics.drawRectangle(0, 0, 10, 10);

      const mesh = graphics.getChildAt(0);

      expect(graphics.fillGradient).toBeNull();
      expect(mesh.texture).toBeNull();
      expect(mesh.uvs).toBeNull();
      expect(mesh.tint.equals(new Color(10, 20, 30))).toBe(true);
    });

    test('lineGradient drives stroke draws through the texture path', () => {
      const graphics = new Graphics();

      graphics.lineWidth = 4;
      graphics.lineGradient = new RadialGradient([
        { offset: 0, color: Color.white },
        { offset: 1, color: Color.black },
      ]);
      graphics.drawLine(0, 0, 20, 0);

      const mesh = graphics.getChildAt(0);

      expect(mesh.texture).toBeInstanceOf(DataTexture);
      expect(mesh.uvs).not.toBeNull();
    });

    test('clear() resets gradients and destroys owned textures', () => {
      const graphics = new Graphics();

      graphics.fillGradient = createLinearGradient();
      graphics.drawRectangle(0, 0, 10, 10);

      const texture = graphics.getChildAt(0).texture as DataTexture;
      const destroySpy = vi.spyOn(texture, 'destroy');

      graphics.clear();

      expect(graphics.fillGradient).toBeNull();
      expect(graphics.lineGradient).toBeNull();
      expect(graphics.children.length).toBe(0);
      expect(destroySpy).toHaveBeenCalledTimes(1);
    });
  });
});
