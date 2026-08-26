// #region guide:exo-canvas
import { ExoCanvas } from '@codexo/exojs-react';

function Game() {
  return (
    <ExoCanvas options={{ canvas: { width: 1280, height: 720 } }} style={{ width: 1280, height: 720 }}>
      <div style={{ position: 'absolute', top: 8, left: 8 }}>HUD overlay</div>
    </ExoCanvas>
  );
}
// #endregion guide:exo-canvas

export { Game };
