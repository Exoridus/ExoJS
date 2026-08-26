import { Circle } from '@codexo/exojs';

// #region guide:collision-types
const a = new Circle(100, 100, 20);
const b = new Circle(130, 100, 20);

const response = a.collidesWith(b);

if (response) {
  const halfX = response.projectionV.x * 0.5;
  const halfY = response.projectionV.y * 0.5;

  a.setPosition(a.x + halfX, a.y + halfY);
  b.setPosition(b.x - halfX, b.y - halfY);
}
// #endregion guide:collision-types
