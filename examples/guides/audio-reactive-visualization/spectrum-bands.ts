import { Scene, type Seconds } from '@codexo/exojs';
import { AudioAnalyser } from '@codexo/exojs-audio-fx';

class BandScene extends Scene {
  private analyser = new AudioAnalyser({ fftSize: 1024 });

  // #region guide:spectrum-bands
  update(delta: Seconds) {
    const mel32 = this.analyser.getSpectrumMel(undefined, { bands: 32 });
    // mel32[0] is the lowest mel band, mel32[31] is the highest

    const log64 = this.analyser.getSpectrumLog(undefined, { bands: 64 });
    // log64[b] covers ~1/64 of the log2(fMax/fMin) octave range

    // Quick band energy without building a filterbank
    const bass = this.analyser.getBandEnergy(20, 250);
    const { low, mid, high } = this.analyser.getLowMidHigh();
    const overall = this.analyser.getRms();
  }
  // #endregion guide:spectrum-bands
}

export { BandScene };
