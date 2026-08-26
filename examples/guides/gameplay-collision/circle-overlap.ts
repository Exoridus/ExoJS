import { Circle, Rectangle } from '@codexo/exojs';

// #region guide:circle-overlap
const player = new Circle(400, 300, 20);
const wall = new Rectangle(100, 200, 80, 160);

if (player.intersectsWith(wall)) {
  // prevent movement into the wall
}
// #endregion guide:circle-overlap
