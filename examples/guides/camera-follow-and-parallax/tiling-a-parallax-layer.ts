import { Graphics } from '@codexo/exojs';

// #region guide:tiling-a-parallax-layer
const viewW = 800;
const maxOffset = viewW * 0.3; // 30% for the slowest layer
const totalW = viewW + maxOffset * 2;
const tileWidth = 128;
const tileHeight = 600;
const g = new Graphics();

// Tile the pattern across [(-maxOffset), (viewW + maxOffset)]
for (let x = -maxOffset; x < viewW + maxOffset; x += tileWidth) {
  g.drawRectangle(x, 0, tileWidth, tileHeight);
}
// #endregion guide:tiling-a-parallax-layer
