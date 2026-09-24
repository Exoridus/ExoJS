// #region guide:spectrum-scene
import { Color, Graphics, type RenderingContext, Scene } from '@codexo/exojs';
import { AudioAnalyser } from '@codexo/exojs-audio-fx';

export class SpectrumScene extends Scene {
  private analyser!: AudioAnalyser;
  private readonly bars = new Graphics();

  override init(): void {
    this.analyser = this.track(new AudioAnalyser({ source: this.app.audio.music, fftSize: 1024 }));
    this.root.addChild(this.bars);
  }

  override update(): void {
    const levels = this.analyser.getSpectrumLog(undefined, { bands: 32 });
    const width = this.app.width / levels.length;

    this.bars.clear();
    this.bars.fillColor = new Color(90, 180, 240);
    for (let index = 0; index < levels.length; index++) {
      const height = (levels[index] / 255) * this.app.height * 0.6;
      this.bars.drawRectangle(index * width, this.app.height - height, Math.max(1, width - 2), height);
    }
  }

  override draw(context: RenderingContext): void {
    context.render(this.root);
  }
}
// #endregion guide:spectrum-scene
