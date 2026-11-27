import type { TileMapObject } from './ObjectLayer';

/** Affine object geometry mapping; tile images and text keep their display dimensions. */
export const projectObject = (
  object: TileMapObject,
  a: number,
  b: number,
  c: number,
  d: number,
  offsetX: number,
  offsetY: number,
): TileMapObject => {
  const x = a * object.x + c * object.y + offsetX;
  const y = b * object.x + d * object.y + offsetY;
  const base = { ...object, x, y };

  if (object.kind === 'tile' && object.rotationOrigin) {
    const pivot = object.rotationOrigin;

    return { ...object, x, y, rotationOrigin: { x: a * pivot.x + c * pivot.y + offsetX, y: b * pivot.x + d * pivot.y + offsetY } };
  }

  if (object.kind === 'point' || object.kind === 'tile' || object.kind === 'text') {
    return base;
  }

  const angle = (object.rotation * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const ax = a * cos + c * sin;
  const ay = b * cos + d * sin;
  const bx = c * cos - a * sin;
  const by = d * cos - b * sin;

  if (object.kind === 'ellipse') {
    const rx = object.width / 2;
    const ry = object.height / 2;
    const xx = (ax * rx) ** 2 + (bx * ry) ** 2;
    const yy = (ay * rx) ** 2 + (by * ry) ** 2;
    const xy = ax * ay * rx * rx + bx * by * ry * ry;
    const spread = Math.hypot(xx - yy, 2 * xy);
    const major = Math.sqrt(Math.max(0, (xx + yy + spread) / 2));
    const minor = Math.sqrt(Math.max(0, (xx + yy - spread) / 2));
    const rotation = Math.atan2(2 * xy, xx - yy) / 2;
    const u = Math.cos(rotation);
    const v = Math.sin(rotation);

    return {
      ...base,
      kind: 'ellipse',
      x: x + ax * rx + bx * ry - u * major + v * minor,
      y: y + ay * rx + by * ry - v * major - u * minor,
      width: major * 2,
      height: minor * 2,
      rotation: (rotation * 180) / Math.PI,
    };
  }

  const source =
    object.kind === 'rectangle'
      ? [
          { x: 0, y: 0 },
          { x: object.width, y: 0 },
          { x: object.width, y: object.height },
          { x: 0, y: object.height },
        ]
      : object.points;
  const points = source.map(point => ({ x: ax * point.x + bx * point.y, y: ay * point.x + by * point.y }));

  if (a * d - b * c < 0) {
    points.reverse();
  }

  return { ...base, kind: object.kind === 'polyline' ? 'polyline' : 'polygon', width: 0, height: 0, rotation: 0, points };
};
