// #region guide:headless-hook
import { useExoApplication } from '@codexo/exojs-react';

const Game = () => {
  const { app, canvasRef } = useExoApplication({ canvas: { width: 800, height: 600 } });

  // `app` is null until the canvas is mounted; render it however you like.
  return <canvas ref={canvasRef} className="game-surface" />;
};
// #endregion guide:headless-hook

export { Game };
