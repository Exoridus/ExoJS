import { Color } from '#core/Color';
import { Circle } from '#math/Circle';
import { Ellipse } from '#math/Ellipse';
import { Rectangle } from '#math/Rectangle';
import { Graphics } from '#rendering/primitives/Graphics';
import { GraphicsPath } from '#rendering/primitives/GraphicsPath';

export const graphicsGeometryCases = [
  'tangent-path',
  'tangent-immediate',
  'bezier-loop',
  'arc-cursor',
  'open-base-cut',
  'small-circle',
  'small-circle-retained',
  'small-ellipse',
  'small-ellipse-retained',
] as const;

type GeometryCase = (typeof graphicsGeometryCases)[number];

interface GeometryScene {
  readonly root: Graphics;
  readonly white: readonly [number, number];
  readonly black: readonly [number, number];
  readonly dispose: () => void;
}

export const createGraphicsGeometryScene = (kind: GeometryCase): GeometryScene => {
  const root = new Graphics({ fill: Color.white });
  const resources: Array<{ destroy(): void }> = [];
  let white: readonly [number, number];
  let black: readonly [number, number] = [2, 2];

  if (kind === 'tangent-path' || kind === 'tangent-immediate') {
    root.lineWidth = 4;
    root.lineColor = Color.white;

    if (kind === 'tangent-path') {
      root.drawShape(new GraphicsPath().moveTo(8, 8).arcTo(48, 8, 48, 48, 20), 0.01);
    } else {
      root.moveTo(8, 8).arcTo(48, 8, 48, 48, 20);
    }

    white = [42, 14];
    black = [8, 28];
  } else if (kind === 'bezier-loop') {
    root.fillColor = Color.white;
    root.drawShape(new GraphicsPath().moveTo(32, 8).bezierCurveTo(62, 56, 2, 56, 32, 8).closePath(), 0.01);
    white = [32, 30];
  } else if (kind === 'arc-cursor') {
    root.lineWidth = 3;
    root.lineColor = Color.white;
    root.drawShape(new GraphicsPath().arc(32, 32, 10, 0, 3 * Math.PI).quadraticCurveTo(52, 32, 52, 52), 0.01);
    white = [49, 37];
  } else if (kind === 'open-base-cut') {
    const cut = new Rectangle(100, 100, 5, 5);

    resources.push(cut);
    root.fillColor = Color.white;
    root.addShape(new GraphicsPath().moveTo(8, 8).lineTo(56, 8).lineTo(8, 56)).cutShape(cut);
    white = [16, 16];
    black = [48, 48];
  } else {
    const ellipse = kind.includes('ellipse');

    root.fillColor = Color.white;
    root.setScale(4000).setPosition(32, 32);

    if (kind.endsWith('retained')) {
      const source = ellipse ? new Ellipse(0, 0, 0.005, 0.0025) : new Circle(0, 0, 0.005);

      resources.push(source);
      root.addShape(source);
    } else if (ellipse) {
      root.drawEllipse(0, 0, 0.005, 0.0025);
    } else {
      root.drawCircle(0, 0, 0.005);
    }

    white = [32, 32];
  }

  return {
    root,
    white,
    black,
    dispose: () => {
      root.destroy();

      for (const resource of resources) {
        resource.destroy();
      }
    },
  };
};
