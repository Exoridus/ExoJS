import { Circle, Rectangle } from '@codexo/exojs';

// #region guide:shape-queries
const player = new Circle(200, 180, 20);
const surface = new Rectangle(100, 200, 300, 40);
let isGrounded = false;

const response = player.collidesWith(surface);

if (response) {
  // Separate first
  player.setPosition(player.x + response.projectionV.x, player.y + response.projectionV.y);

  // Then classify direction
  if (response.projectionN.y < -0.7) {
    // Normal points upward - player is on a floor
    isGrounded = true;
  } else if (Math.abs(response.projectionN.x) > 0.7) {
    // Normal is mostly horizontal - player hit a wall
  }
}
// #endregion guide:shape-queries
