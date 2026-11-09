import { TAU } from '#math/utils';

interface TangentArc {
  readonly radius: number;
  readonly startX: number;
  readonly startY: number;
  readonly centerX: number;
  readonly centerY: number;
  readonly startAngle: number;
  readonly endAngle: number;
  readonly anticlockwise: boolean;
}

/** The short arc tangent to two finite segments, or null when the corner cannot fit. @internal */
export const tangentArc = (
  fromX: number,
  fromY: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  radius: number,
): TangentArc | null => {
  const r = Math.abs(radius);
  const inLen = Math.hypot(x1 - fromX, y1 - fromY);
  const outLen = Math.hypot(x2 - x1, y2 - y1);

  if (r === 0 || inLen === 0 || outLen === 0) {
    return null;
  }

  const inX = (x1 - fromX) / inLen;
  const inY = (y1 - fromY) / inLen;
  const outX = (x2 - x1) / outLen;
  const outY = (y2 - y1) / outLen;
  const angle = Math.acos(Math.min(1, Math.max(-1, inX * outX + inY * outY)));

  if (angle === 0 || angle === Math.PI) {
    return null;
  }

  // This is the turn between travel directions, not the interior corner angle.
  const distance = r * Math.tan(angle / 2);

  if (!Number.isFinite(distance) || distance > inLen || distance > outLen) {
    return null;
  }

  const startX = x1 - inX * distance;
  const startY = y1 - inY * distance;
  const positiveTurn = inX * outY - inY * outX > 0;
  const centerX = startX + (positiveTurn ? -inY : inY) * r;
  const centerY = startY + (positiveTurn ? inX : -inX) * r;

  return {
    radius: r,
    startX,
    startY,
    centerX,
    centerY,
    startAngle: Math.atan2(startY - centerY, startX - centerX),
    endAngle: Math.atan2(y1 + outY * distance - centerY, x1 + outX * distance - centerX),
    anticlockwise: !positiveTurn,
  };
};

/** Signed sweep limited to one turn, with opposite-direction angles wrapped. @internal */
export const arcSweep = (startAngle: number, endAngle: number, anticlockwise: boolean): number => {
  const sweep = endAngle - startAngle;

  if (!anticlockwise && sweep >= TAU) {
    return TAU;
  }

  if (anticlockwise && sweep <= -TAU) {
    return -TAU;
  }

  const wrapped = sweep % TAU;

  if (anticlockwise && wrapped > 0) {
    return wrapped - TAU;
  }

  return !anticlockwise && wrapped < 0 ? wrapped + TAU : wrapped;
};
