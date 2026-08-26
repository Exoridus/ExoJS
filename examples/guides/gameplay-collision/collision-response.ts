import { Circle, Rectangle } from '@codexo/exojs';

// #region guide:collision-response
const player = new Circle(400, 300, 20);
const wall = new Rectangle(100, 200, 80, 160);

// Top-down wall blocking - push the player out of the wall
const response = player.collidesWith(wall);

if (response) {
  player.setPosition(player.x + response.projectionV.x, player.y + response.projectionV.y);
}
// #endregion guide:collision-response
