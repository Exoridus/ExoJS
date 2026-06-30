import { Color } from '#core/Color';
import { LinearGradient } from '#rendering/gradient/LinearGradient';
import { RadialGradient } from '#rendering/gradient/RadialGradient';
import { Graphics } from '#rendering/primitives/Graphics';
import { DataTexture } from '#rendering/texture/DataTexture';

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

  describe('fill and stroke styles', () => {
    test('fillStyle defaults to the solid fill color slot, which is transparent', () => {
      const graphics = new Graphics();

      expect(graphics.fillStyle).toBeInstanceOf(Color);
      expect(graphics.fillStyle).toBe(graphics.fillColor);
      expect(graphics.fillColor.a).toBe(0);
    });

    test('an unset fill paints no fill mesh — an outline-only shape stays see-through', () => {
      const graphics = new Graphics();

      graphics.lineWidth = 2;
      graphics.lineColor = new Color(255, 255, 255);
      graphics.drawRectangle(0, 0, 10, 10);

      // Only the stroke mesh; no opaque fill bleeding underneath.
      expect(graphics.children.length).toBe(1);
    });

    test('an explicit transparent fill also paints no fill mesh', () => {
      const graphics = new Graphics();

      graphics.fillColor = Color.transparentBlack;
      graphics.drawRectangle(0, 0, 10, 10);

      expect(graphics.children.length).toBe(0);
    });

    test('an opaque fill paints exactly one fill mesh', () => {
      const graphics = new Graphics();

      graphics.fillColor = new Color(10, 20, 30);
      graphics.drawRectangle(0, 0, 10, 10);

      expect(graphics.children.length).toBe(1);
    });

    test('strokeStyle defaults to the solid line color slot', () => {
      const graphics = new Graphics();

      expect(graphics.strokeStyle).toBeInstanceOf(Color);
      expect(graphics.strokeStyle).toBe(graphics.lineColor);
    });

    test('fillStyle = Color copies into the fillColor slot and fills solid', () => {
      const graphics = new Graphics();

      graphics.fillStyle = new Color(10, 20, 30);
      graphics.drawRectangle(0, 0, 10, 10);

      const mesh = graphics.getChildAt(0);

      expect(graphics.fillColor.equals(new Color(10, 20, 30))).toBe(true);
      expect(graphics.fillStyle).toBe(graphics.fillColor);
      expect(mesh.texture).toBeNull();
      expect(mesh.uvs).toBeNull();
      expect(mesh.tint.equals(new Color(10, 20, 30))).toBe(true);
    });

    test('strokeStyle = Color copies into the lineColor slot and strokes solid', () => {
      const graphics = new Graphics();

      graphics.lineWidth = 4;
      graphics.strokeStyle = new Color(40, 50, 60);
      graphics.drawLine(0, 0, 20, 0);

      const mesh = graphics.getChildAt(0);

      expect(graphics.lineColor.equals(new Color(40, 50, 60))).toBe(true);
      expect(graphics.strokeStyle).toBe(graphics.lineColor);
      expect(mesh.texture).toBeNull();
      expect(mesh.tint.equals(new Color(40, 50, 60))).toBe(true);
    });

    test('fillStyle = Gradient is cloned on assignment', () => {
      const graphics = new Graphics();
      const gradient = createLinearGradient();

      graphics.fillStyle = gradient;

      expect(graphics.fillStyle).toBeInstanceOf(LinearGradient);
      expect(graphics.fillStyle).not.toBe(gradient);
      expect((graphics.fillStyle as LinearGradient).equals(gradient)).toBe(true);
    });

    test('filling with a gradient style builds a textured mesh with bounding-box UVs', () => {
      const graphics = new Graphics();

      graphics.fillStyle = createLinearGradient();
      graphics.drawRectangle(0, 0, 20, 10);

      const mesh = graphics.getChildAt(0);

      expect(mesh.texture).toBeInstanceOf(DataTexture);
      expect(mesh.uvs).not.toBeNull();
      // Rectangle corners (TL, TR, BL, BR) map to the unit UV square.
      expect(Array.from(mesh.uvs!)).toEqual([0, 0, 1, 0, 0, 1, 1, 1]);
      // White tint leaves the sampled gradient unmodulated.
      expect(mesh.tint.equals(Color.white)).toBe(true);
    });

    test('strokeStyle = Gradient drives stroke draws through the texture path', () => {
      const graphics = new Graphics();

      graphics.lineWidth = 4;
      graphics.strokeStyle = new RadialGradient([
        { offset: 0, color: Color.white },
        { offset: 1, color: Color.black },
      ]);
      graphics.drawLine(0, 0, 20, 0);

      const mesh = graphics.getChildAt(0);

      expect(mesh.texture).toBeInstanceOf(DataTexture);
      expect(mesh.uvs).not.toBeNull();
    });

    test('repeated fills with the same gradient style share one rasterized texture', () => {
      const graphics = new Graphics();

      graphics.fillStyle = createLinearGradient();
      graphics.drawRectangle(0, 0, 10, 10);
      graphics.drawCircle(40, 40, 8);

      const first = graphics.getChildAt(0).texture;
      const second = graphics.getChildAt(1).texture;

      expect(first).toBeInstanceOf(DataTexture);
      expect(second).toBe(first);
    });

    test('setting fillColor replaces a gradient fill style with a solid color', () => {
      const graphics = new Graphics();

      graphics.fillStyle = createLinearGradient();
      graphics.fillColor = new Color(10, 20, 30);
      graphics.drawRectangle(0, 0, 10, 10);

      const mesh = graphics.getChildAt(0);

      expect(graphics.fillStyle).toBeInstanceOf(Color);
      expect(graphics.fillStyle).toBe(graphics.fillColor);
      expect(mesh.texture).toBeNull();
      expect(mesh.uvs).toBeNull();
      expect(mesh.tint.equals(new Color(10, 20, 30))).toBe(true);
    });

    test('setting lineColor replaces a gradient stroke style with a solid color', () => {
      const graphics = new Graphics();

      graphics.lineWidth = 4;
      graphics.strokeStyle = createLinearGradient();
      graphics.lineColor = new Color(1, 2, 3);
      graphics.drawLine(0, 0, 20, 0);

      const mesh = graphics.getChildAt(0);

      expect(graphics.strokeStyle).toBeInstanceOf(Color);
      expect(graphics.strokeStyle).toBe(graphics.lineColor);
      expect(mesh.texture).toBeNull();
      expect(mesh.tint.equals(new Color(1, 2, 3))).toBe(true);
    });

    test('fillStyle = null reverts to the solid fill color', () => {
      const graphics = new Graphics();

      graphics.fillColor = new Color(7, 8, 9);
      graphics.fillStyle = createLinearGradient();
      graphics.fillStyle = null;
      graphics.drawRectangle(0, 0, 10, 10);

      const mesh = graphics.getChildAt(0);

      expect(graphics.fillStyle).toBe(graphics.fillColor);
      expect(mesh.texture).toBeNull();
      expect(mesh.tint.equals(new Color(7, 8, 9))).toBe(true);
    });

    test('clear() resets styles and destroys owned textures', () => {
      const graphics = new Graphics();

      graphics.fillStyle = createLinearGradient();
      graphics.drawRectangle(0, 0, 10, 10);

      const texture = graphics.getChildAt(0).texture as DataTexture;
      const destroySpy = vi.spyOn(texture, 'destroy');

      graphics.clear();

      expect(graphics.fillStyle).toBe(graphics.fillColor);
      expect(graphics.strokeStyle).toBe(graphics.lineColor);
      expect(graphics.fillStyle).toBeInstanceOf(Color);
      expect(graphics.children.length).toBe(0);
      expect(destroySpy).toHaveBeenCalledTimes(1);
    });
  });
});
