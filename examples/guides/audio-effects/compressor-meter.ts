import { Graphics, Scene, type Seconds } from '@codexo/exojs';
import { CompressorEffect } from '@codexo/exojs-audio-fx';

class MeterScene extends Scene {
  private compressor = new CompressorEffect();
  private meterBar = new Graphics();

  // #region guide:compressor-meter
  update(delta: Seconds) {
    const gr = this.compressor.reduction;
    this.meterBar.height = Math.abs(gr) * 10; // scale to pixels
  }
  // #endregion guide:compressor-meter
}

export { MeterScene };
