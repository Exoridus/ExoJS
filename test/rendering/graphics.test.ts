import { Color } from '#core/Color';
import { LinearGradient } from '#rendering/gradient/LinearGradient';
import { RadialGradient } from '#rendering/gradient/RadialGradient';
import { Mesh } from '#rendering/mesh/Mesh';
import { Graphics } from '#rendering/primitives/Graphics';
import type { RenderNode } from '#rendering/RenderNode';
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
  test('lineWidth getter reflects the last assigned value', () => {
    const graphics = new Graphics();

    expect(graphics.lineWidth).toBe(0);

    graphics.lineWidth = 3;

    expect(graphics.lineWidth).toBe(3);
  });

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

  describe('child-type guard', () => {
    test('addChild rejects a non-Mesh child', () => {
      const graphics = new Graphics();
      const nonMesh = { destroy: () => undefined } as unknown as RenderNode;

      expect(() => graphics.addChild(nonMesh)).toThrow('Graphics can only contain Mesh children.');
    });

    test('addChildAt rejects a non-Mesh child', () => {
      const graphics = new Graphics();
      const nonMesh = { destroy: () => undefined } as unknown as RenderNode;

      expect(() => graphics.addChildAt(nonMesh, 0)).toThrow('Graphics can only contain Mesh children.');
    });

    test('addChild accepts a Mesh child', () => {
      const graphics = new Graphics();
      const mesh = new Mesh({ vertices: new Float32Array([0, 0, 10, 0, 10, 10]) });

      expect(() => graphics.addChild(mesh)).not.toThrow();
      expect(graphics.children.length).toBe(1);
    });
  });

  describe('pen / path methods', () => {
    test('lineTo strokes a segment from the current point and advances the pen', () => {
      const graphics = new Graphics();

      graphics.lineWidth = 2;
      graphics.moveTo(0, 0);
      graphics.lineTo(10, 0);

      expect(graphics.children.length).toBe(1);
      expect(graphics.currentPoint.x).toBe(10);
      expect(graphics.currentPoint.y).toBe(0);
    });

    test('quadraticCurveTo strokes a curve and advances the pen to the end point', () => {
      const graphics = new Graphics();

      graphics.lineWidth = 2;
      graphics.moveTo(0, 0);
      graphics.quadraticCurveTo(5, 10, 10, 0);

      expect(graphics.children.length).toBe(1);
      expect(graphics.currentPoint.x).toBe(10);
      expect(graphics.currentPoint.y).toBe(0);
    });

    test('bezierCurveTo strokes a curve and advances the pen to the end point', () => {
      const graphics = new Graphics();

      graphics.lineWidth = 2;
      graphics.moveTo(0, 0);
      graphics.bezierCurveTo(3, 10, 7, 10, 10, 0);

      expect(graphics.children.length).toBe(1);
      expect(graphics.currentPoint.x).toBe(10);
      expect(graphics.currentPoint.y).toBe(0);
    });
  });

  describe('arcTo degenerate-geometry fallbacks', () => {
    test('radius 0 falls back to a straight lineTo', () => {
      const graphics = new Graphics();

      graphics.lineWidth = 2;
      graphics.moveTo(0, 0);
      graphics.arcTo(10, 0, 10, 10, 0);

      expect(graphics.currentPoint.x).toBe(10);
      expect(graphics.currentPoint.y).toBe(0);
    });

    test('current point already at the corner falls back to a straight lineTo', () => {
      const graphics = new Graphics();

      graphics.lineWidth = 2;
      graphics.moveTo(10, 0);
      graphics.arcTo(10, 0, 10, 10, 2);

      expect(graphics.currentPoint.x).toBe(10);
      expect(graphics.currentPoint.y).toBe(0);
    });

    test('coincident corner and end point fall back to a straight lineTo', () => {
      const graphics = new Graphics();

      graphics.lineWidth = 2;
      graphics.moveTo(0, 0);
      graphics.arcTo(10, 0, 10, 0, 2);

      expect(graphics.currentPoint.x).toBe(10);
      expect(graphics.currentPoint.y).toBe(0);
    });

    test('collinear same-direction corner (angle 0) falls back to a straight lineTo', () => {
      const graphics = new Graphics();

      graphics.lineWidth = 2;
      graphics.moveTo(0, 0);
      graphics.arcTo(10, 0, 20, 0, 2);

      expect(graphics.currentPoint.x).toBe(10);
      expect(graphics.currentPoint.y).toBe(0);
    });

    test('collinear reversing corner (angle PI) falls back to a straight lineTo', () => {
      const graphics = new Graphics();

      graphics.lineWidth = 2;
      graphics.moveTo(0, 0);
      graphics.arcTo(10, 0, 5, 0, 2);

      expect(graphics.currentPoint.x).toBe(10);
      expect(graphics.currentPoint.y).toBe(0);
    });

    test('a right-hand turn (negative cross product) computes the arc on the opposite side', () => {
      const graphics = new Graphics();

      graphics.lineWidth = 2;
      graphics.moveTo(0, 0);
      // Turning downward (clockwise) at the corner produces a negative cross
      // product, exercising the `leftTurn === false` normal-direction branch.
      graphics.arcTo(10, 0, 10, -10, 2);

      expect(graphics.children.length).toBeGreaterThanOrEqual(2);
      expect(graphics.currentPoint.x).toBeCloseTo(10, 4);
      expect(graphics.currentPoint.y).toBeCloseTo(-2, 4);
    });

    test('a radius too large for the segment lengths falls back to a straight lineTo', () => {
      const graphics = new Graphics();

      graphics.lineWidth = 2;
      graphics.moveTo(0, 0);
      // 90 degree turn with a radius far larger than either leg — the tangent
      // distance would exceed both segment lengths.
      graphics.arcTo(10, 0, 10, 10, 1000);

      expect(graphics.currentPoint.x).toBe(10);
      expect(graphics.currentPoint.y).toBe(0);
    });
  });

  describe('drawArc branch matrix', () => {
    test('radius 0 draws nothing', () => {
      const graphics = new Graphics();

      graphics.lineWidth = 2;
      graphics.drawArc(0, 0, 0, 0, Math.PI / 2);

      expect(graphics.children.length).toBe(0);
    });

    test('startAngle === endAngle draws nothing (zero sweep)', () => {
      const graphics = new Graphics();

      graphics.lineWidth = 2;
      graphics.drawArc(0, 0, 10, 0, 0);

      expect(graphics.children.length).toBe(0);
    });

    test('omitting anticlockwise uses the clockwise default', () => {
      const graphics = new Graphics();

      graphics.lineWidth = 2;
      graphics.drawArc(0, 0, 10, 0, Math.PI / 2);

      expect(graphics.children.length).toBe(1);
    });

    test('a negative sweep with anticlockwise=false wraps forward by a full turn', () => {
      const graphics = new Graphics();

      graphics.lineWidth = 2;
      graphics.drawArc(0, 0, 10, Math.PI / 2, 0, false);

      expect(graphics.children.length).toBe(1);
    });

    test('a positive sweep with anticlockwise=true wraps backward by a full turn', () => {
      const graphics = new Graphics();

      graphics.lineWidth = 2;
      graphics.drawArc(0, 0, 10, 0, Math.PI / 2, true);

      expect(graphics.children.length).toBe(1);
    });
  });

  describe('shape draws', () => {
    test('drawPolygon fills only when lineWidth is 0', () => {
      const graphics = new Graphics();

      graphics.fillColor = new Color(1, 2, 3);
      graphics.drawPolygon([0, 0, 10, 0, 10, 10, 0, 10]);

      expect(graphics.children.length).toBe(1);
    });

    test('drawPolygon fills and strokes the closed outline when lineWidth > 0', () => {
      const graphics = new Graphics();

      graphics.fillColor = new Color(1, 2, 3);
      graphics.lineWidth = 2;
      graphics.drawPolygon([0, 0, 10, 0, 10, 10, 0, 10]);

      // One fill mesh plus at least one stroke mesh for the closed outline.
      expect(graphics.children.length).toBeGreaterThanOrEqual(2);
    });

    test('drawCircle strokes its outline when lineWidth > 0', () => {
      const graphics = new Graphics();

      graphics.fillColor = new Color(1, 2, 3);
      graphics.lineWidth = 2;
      graphics.drawCircle(0, 0, 10);

      expect(graphics.children.length).toBeGreaterThanOrEqual(2);
    });

    test('drawEllipse fills only when lineWidth is 0', () => {
      const graphics = new Graphics();

      graphics.fillColor = new Color(1, 2, 3);
      graphics.drawEllipse(0, 0, 10, 5);

      expect(graphics.children.length).toBe(1);
    });

    test('drawEllipse fills and strokes the closed outline when lineWidth > 0', () => {
      const graphics = new Graphics();

      graphics.fillColor = new Color(1, 2, 3);
      graphics.lineWidth = 2;
      graphics.drawEllipse(0, 0, 10, 5);

      expect(graphics.children.length).toBeGreaterThanOrEqual(2);
    });

    test('drawRoundedRectangle fills only when lineWidth is 0', () => {
      const graphics = new Graphics();

      graphics.fillColor = new Color(1, 2, 3);
      graphics.drawRoundedRectangle(0, 0, 20, 10, 3);

      expect(graphics.children.length).toBe(1);
    });

    test('drawRoundedRectangle fills and strokes the closed outline when lineWidth > 0', () => {
      const graphics = new Graphics();

      graphics.fillColor = new Color(1, 2, 3);
      graphics.lineWidth = 2;
      graphics.drawRoundedRectangle(0, 0, 20, 10, 3);

      expect(graphics.children.length).toBeGreaterThanOrEqual(2);
    });

    test('drawStar fills only when lineWidth is 0, using default innerRadius and rotation', () => {
      const graphics = new Graphics();

      graphics.fillColor = new Color(1, 2, 3);
      graphics.drawStar(0, 0, 5, 10);

      expect(graphics.children.length).toBe(1);
    });

    test('drawStar fills and strokes the closed outline when lineWidth > 0, with explicit innerRadius/rotation', () => {
      const graphics = new Graphics();

      graphics.fillColor = new Color(1, 2, 3);
      graphics.lineWidth = 2;
      graphics.drawStar(0, 0, 5, 10, 4, 0.2);

      expect(graphics.children.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('computeBoundsUvs degenerate spans', () => {
    test('a zero-height (horizontal, zero-thickness) gradient stroke collapses V to 0', () => {
      const graphics = new Graphics();

      // Default lineWidth is 0, so buildLine produces a zero-thickness quad
      // whose vertices all share the same Y — a degenerate vertical span.
      graphics.strokeStyle = createLinearGradient();
      graphics.drawLine(0, 5, 10, 5);

      const mesh = graphics.getChildAt(0);
      const uvs = Array.from(mesh.uvs!);

      for (let i = 1; i < uvs.length; i += 2) {
        expect(uvs[i]).toBe(0);
      }
    });

    test('a zero-width (vertical, zero-thickness) gradient stroke collapses U to 0', () => {
      const graphics = new Graphics();

      graphics.strokeStyle = createLinearGradient();
      graphics.drawLine(5, 0, 5, 10);

      const mesh = graphics.getChildAt(0);
      const uvs = Array.from(mesh.uvs!);

      for (let i = 0; i < uvs.length; i += 2) {
        expect(uvs[i]).toBe(0);
      }
    });
  });

  describe('destroy', () => {
    test('destroy clears children and releases pen/style state without throwing', () => {
      const graphics = new Graphics();

      graphics.fillColor = new Color(1, 2, 3);
      graphics.lineWidth = 2;
      graphics.drawRectangle(0, 0, 10, 10);

      expect(() => graphics.destroy()).not.toThrow();
      expect(graphics.children.length).toBe(0);
    });
  });
});
