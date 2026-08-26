import { DataTexture, Scene, type Seconds, Sprite, TextureFormat } from '@codexo/exojs';
import { AudioAnalyser } from '@codexo/exojs-audio-fx';

class SpectrogramScene extends Scene {
  private analyser!: AudioAnalyser;
  private specTex!: DataTexture;
  private specSprite!: Sprite;
  private col = 0;

  // #region guide:spectrogram
  init() {
    this.analyser = new AudioAnalyser({ fftSize: 512 });
    this.analyser.source = this.app.audio.music;

    this.specTex = new DataTexture({
      width: 256, // scroll history in columns
      height: 64, // one row per mel band
      format: TextureFormat.R8,
    });

    this.specSprite = new Sprite(this.specTex);
    this.specSprite.setAnchor(0, 1);
    this.specSprite.setPosition(0, this.app.height);

    this.col = 0;
  }

  update(delta: Seconds) {
    const bands = this.analyser.getSpectrumMel(undefined, { bands: 64 });
    const buf = this.specTex.buffer;

    // Write one column of spectrum data
    for (let row = 0; row < 64; row++) {
      buf[row * 256 + this.col] = bands[row];
    }

    this.specTex.commitRect(this.col, 0, 1, 64);
    this.col = (this.col + 1) % 256;
  }
  // #endregion guide:spectrogram
}

export { SpectrogramScene };
