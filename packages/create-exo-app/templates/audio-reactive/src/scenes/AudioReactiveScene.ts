import { AudioAnalyser, Color, getAudioContext, Graphics, Scene, Text } from '@codexo/exojs';
import type { RenderingContext } from '@codexo/exojs';

const BAR_COUNT = 32;

export class AudioReactiveScene extends Scene {
  private _analyser!: AudioAnalyser;
  private _bars!: Graphics;
  private _prompt!: Text;
  private _started = false;

  public override init(): void {
    const { width, height } = this.app!.canvas;

    this._prompt = new Text('Click to start', {
      align: 'center',
      fillColor: Color.white,
      fontSize: 28,
    });
    this._prompt.setAnchor(0.5);
    this._prompt.setPosition(width / 2, height / 2);

    this._bars = new Graphics();
    this._analyser = new AudioAnalyser({ fftSize: 512, smoothingTimeConstant: 0.75 });

    this.addChild(this._prompt);
    this.addChild(this._bars);

    const onTap = (): void => {
      if (this._started) return;
      this._started = true;
      this._prompt.visible = false;

      // Use the shared audio context — the pointer gesture unlocks it.
      const ctx = getAudioContext();

      // Sawtooth oscillator as an always-on audio source for the analyser.
      // Frequency sweeps slowly to produce a varied spectrum.
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      gain.gain.value = 0.1;
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(60, ctx.currentTime);
      osc.frequency.linearRampToValueAtTime(880, ctx.currentTime + 6);
      osc.frequency.linearRampToValueAtTime(60, ctx.currentTime + 12);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();

      // AudioAnalyser accepts any AudioNode as source
      this._analyser.source = osc;
    };

    this.app!.input.onPointerTap.add(onTap);
  }

  public override draw(context: RenderingContext): void {
    const { width, height } = this.app!.canvas;
    context.backend.clear(new Color(8, 8, 16));

    if (this._started) {
      const spectrum = this._analyser.getSpectrum();
      const barWidth = width / BAR_COUNT;
      const maxHeight = height * 0.75;

      this._bars.clear();

      for (let i = 0; i < BAR_COUNT; i++) {
        const binIndex = Math.floor((i / BAR_COUNT) * spectrum.length * 0.5);
        const value = (spectrum[binIndex] ?? 0) / 255;
        const barHeight = Math.max(2, value * maxHeight);
        const t = i / (BAR_COUNT - 1);
        // Gradient from cyan (low freq) to magenta (high freq)
        const r = Math.floor(t * 220);
        const g = Math.floor((1 - Math.abs(t - 0.5) * 2) * 160 + 60);
        const b = Math.floor((1 - t) * 220 + 35);
        this._bars.fillColor = new Color(r, g, b);
        this._bars.drawRectangle(i * barWidth + 1, height - barHeight, barWidth - 2, barHeight);
      }
    }

    context.render(this.root);
  }
}
