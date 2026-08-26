import { Color, Scene, type Seconds, type Sound, Sprite, Text } from '@codexo/exojs';

class DialogScene extends Scene {
  private lines: string[] = [];
  private portrait!: Sprite;
  private box!: Text;
  private beep!: Sound;
  private lineIndex = 0;
  private chars = 0;
  private timer = 0;
  private done = false;

  // #region guide:typewriter
  override init(): void {
    this.lines = ['Commander, the anomaly has entered low orbit.', 'All wings hold formation and await my signal.'];

    this.portrait = new Sprite(this.loader.get('image/portrait.png')).setAnchor(0.5).setScale(1.7).setPosition(170, 420);

    this.box = new Text('', {
      fillColor: Color.white,
      fontSize: 30,
      maxWidth: 600,
      lineHeight: 1.4,
    });
    this.box.setPosition(270, 360);

    this.beep = this.loader.get('audio/beep.ogg');

    this.lineIndex = 0;
    this.chars = 0;
    this.timer = 0;
    this.done = false;
  }

  override update(delta: Seconds): void {
    if (this.done) return;

    this.timer += delta;
    const line = this.lines[this.lineIndex];

    while (this.timer > 0.035 && this.chars < line.length) {
      this.timer -= 0.035;
      this.chars++;
      this.app.audio.play(this.beep, { playbackRate: 1.9, volume: 0.14 });
    }

    this.box.text = line.slice(0, this.chars);

    if (this.chars >= line.length) {
      this.done = true;
    }
  }
  // #endregion guide:typewriter

  private bindAdvance(): void {
    // #region guide:advance-line
    this.app.input.onPointerTap.add(() => {
      const line = this.lines[this.lineIndex];

      if (!this.done) {
        // Skip reveal - show full line
        this.chars = line.length;
        this.done = true;
        return;
      }

      // Advance to next line
      this.lineIndex = (this.lineIndex + 1) % this.lines.length;
      this.chars = 0;
      this.done = false;
    });
    // #endregion guide:advance-line
  }
}

export { DialogScene };
