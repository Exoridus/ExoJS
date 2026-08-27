import { Color, Ease, Scene, type Seconds, Sprite, View } from '@codexo/exojs';
import { AudioAnalyser, BeatDetector, type BeatInfo } from '@codexo/exojs-audio-fx';
import { BurstSpawn, Constant } from '@codexo/exojs-particles';

class BeatHookScene extends Scene {
  private analyser = new AudioAnalyser({ fftSize: 512 });
  private detector = new BeatDetector();
  private burst = new BurstSpawn({ schedule: [{ time: 0, count: 60 }] });
  private logo = new Sprite();
  private view = new View(400, 300, 800, 600);

  private bindBeats(): void {
    // #region guide:beat-hooks
    // Bar start -> tween chain on a central logo
    this.detector.onBarStart.add(() => {
      this.app.tweens.create(this.logo.scale).to({ x: 1.3, y: 1.3 }, 0.15).easing(Ease.cubicOut).yoyo().repeat(1).start();
    });

    // Mid-band -> particle tint cycling
    this.detector.onBeat.add((info: BeatInfo) => {
      if (info.beatInBar === 2 || info.beatInBar === 4) {
        this.burst.config.tint = new Constant(info.beatInBar === 2 ? new Color(0xffa500) : new Color(0x87ceeb));
        this.burst.reset();
      }
    });
    // #endregion guide:beat-hooks
  }

  // #region guide:low-band-shake
  override update(delta: Seconds): void {
    const { low } = this.analyser.getLowMidHigh();
    const shakeX = (Math.random() - 0.5) * low * 20;
    const shakeY = (Math.random() - 0.5) * low * 20;
    this.view.setCenter(400 + shakeX, 300 + shakeY);
  }
  // #endregion guide:low-band-shake
}

export { BeatHookScene };
