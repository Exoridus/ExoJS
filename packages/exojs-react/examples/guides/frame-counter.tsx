// #region guide:frame-counter
import { useExoApp, useSignal } from '@codexo/exojs-react';

function FrameCounter() {
  const app = useExoApp(); // throws if rendered outside <ExoCanvas>
  const frameCount = useSignal(app.onFrame, () => app.frameCount);
  return <span>Frame: {frameCount}</span>;
}
// #endregion guide:frame-counter

export { FrameCounter };
