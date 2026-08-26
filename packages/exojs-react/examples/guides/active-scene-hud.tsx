// #region guide:active-scene-hud
import { useActiveScene } from '@codexo/exojs-react';

import type { GameScene } from './scenes';

function Hud() {
  const scene = useActiveScene<GameScene>();
  if (scene === null) return null;
  return <div style={{ position: 'absolute', top: 8, left: 8 }}>Score: {scene.score}</div>;
}
// #endregion guide:active-scene-hud

export { Hud };
