// Auto-generated from reverb-and-delay.ts - edit the .ts source, not this file.
import { Application, Color, FixedResolutionCanvasSizing, Graphics, Scene, Text } from '@codexo/exojs';
import { DelayEffect, ReverbEffect } from '@codexo/exojs-audio-fx';
import { mountControls } from '@examples/runtime';
class ReverbAndDelayScene extends Scene {
  sound;
  reverb;
  delay;
  sliders = [];
  labels = [];
  gfx;
  prompt;
  tapPrompt;
  flash = 0;
  triggers = 0;
  drag = -1;
  // Canvas-relative layout computed in init().
  pad = { x: 0, y: 0, w: 0, h: 0 };
  barX = 0;
  barW = 0;
  labelX = 0;
  rowY = [];
  hud;
  init() {
    const app = this.app;
    const { width, height } = app;
    this.pad = { x: width / 2 - 240, y: 36, w: 480, h: 100 };
    this.barW = width * 0.5;
    this.barX = width * 0.25;
    this.labelX = width * 0.06;
    this.rowY = Array.from({ length: 5 }, (_, i) => 210 + i * 78);
    // Path-only get() infers Sound from the .ogg extension - sidesteps a
    // compile-time overload ambiguity between Sound and the Json token form
    // when passing the Sound token explicitly.
    this.sound = this.loader.get('audio/impact-light.ogg');
    // Reverb (room tail) → Delay (echoes) chained on the sound bus.
    this.reverb = new ReverbEffect({ wet: 0.4, decay: 2 });
    this.delay = new DelayEffect({ wet: 0.35, delaySeconds: 0.25, feedback: 0.45 });
    app.audio.sound.addEffect(this.reverb);
    app.audio.sound.addEffect(this.delay);
    this.sliders = [
      { label: 'reverb wet', min: 0, max: 1, get: () => this.reverb.wet, set: v => (this.reverb.wet = v) },
      { label: 'reverb decay', min: 0.5, max: 10, get: () => this.reverb.decay, set: v => (this.reverb.decay = v) },
      { label: 'delay wet', min: 0, max: 1, get: () => this.delay.wet, set: v => (this.delay.wet = v) },
      { label: 'delay time (s)', min: 0.02, max: 0.82, get: () => this.delay.delaySeconds, set: v => (this.delay.delaySeconds = v) },
      { label: 'delay feedback', min: 0, max: 0.95, get: () => this.delay.feedback, set: v => (this.delay.feedback = v) },
    ];
    this.labels = this.sliders.map((_, i) => {
      const label = new Text('', { fillColor: Color.white, fontSize: 16 });
      label.setPosition(this.labelX, this.rowY[i] - 12);
      return label;
    });
    this.gfx = new Graphics();
    this.prompt = new Text('', { fillColor: Color.white, fontSize: 22, align: 'center' })
      .setAnchor(0.5, 0.5)
      .setPosition(width / 2, this.pad.y + this.pad.h / 2);
    // Shown while the browser still blocks audio (`app.audio.locked`); the
    // first click or keypress unlocks it.
    this.tapPrompt = new Text('Click or press any key to start audio', { fillColor: Color.white, fontSize: 22, align: 'center' })
      .setAnchor(0.5, 0.5)
      .setPosition(width / 2, height - 48);
    this.hud = mountControls({
      title: 'Reverb and Delay',
      controls: [
        { keys: 'Click pad', action: 'trigger the impact sound' },
        { keys: 'Drag bar', action: 'sweep a parameter' },
      ],
      status: 'Click or press any key to start…',
    });
    this.root.addChild(this.gfx, ...this.labels, this.prompt, this.tapPrompt);
    app.input.onPointerDown.add(p => {
      if (p.x >= this.pad.x && p.x <= this.pad.x + this.pad.w && p.y >= this.pad.y && p.y <= this.pad.y + this.pad.h) {
        this.strike();
        return;
      }
      this.drag = this.sliderAt(p.y);
      this.apply(p.x);
    });
    app.input.onPointerMove.add(p => this.apply(p.x));
    app.input.onPointerUp.add(() => {
      this.drag = -1;
    });
    this.hud.setStatus('Click the pad to trigger the impact');
  }
  sliderAt(y) {
    for (let i = 0; i < this.rowY.length; i++) if (Math.abs(y - this.rowY[i]) <= 16) return i;
    return -1;
  }
  apply(x) {
    if (this.drag < 0) return;
    const def = this.sliders[this.drag];
    const t = Math.max(0, Math.min(1, (x - this.barX) / this.barW));
    def.set(def.min + (def.max - def.min) * t);
  }
  strike() {
    // The pointer gesture also unlocks the AudioContext; firing while still
    // locked would be silent, so wait until audio is ready.
    if (this.app.audio.locked) return;
    this.app.audio.play(this.sound);
    this.flash = 1;
    this.triggers += 1;
    this.hud.setStatus(`Impacts triggered: ${this.triggers}`);
  }
  update(delta) {
    this.flash = Math.max(0, this.flash - delta * 2.2);
  }
  draw(context) {
    const app = this.app;
    this.gfx.clear();
    // A big click pad that flashes on each trigger so the play action reads.
    const lit = Math.floor(60 + this.flash * 180);
    this.gfx.fillColor = new Color(lit, lit, Math.floor(60 + this.flash * 120));
    this.gfx.drawRoundedRectangle(this.pad.x, this.pad.y, this.pad.w, this.pad.h, 12);
    for (let i = 0; i < this.sliders.length; i++) {
      const def = this.sliders[i];
      const y = this.rowY[i];
      const value = def.get();
      const t = (value - def.min) / (def.max - def.min);
      this.gfx.fillColor = new Color(70, 70, 70);
      this.gfx.drawRectangle(this.barX, y - 6, this.barW, 12);
      this.gfx.fillColor = new Color(120, 200, 255);
      this.gfx.drawRectangle(this.barX, y - 6, this.barW * t, 12);
      this.labels[i].text = `${def.label}: ${value.toFixed(2)}`;
    }
    this.prompt.text = app.audio.locked ? 'Click or press a key to enable audio' : 'Click the pad to play impact';
    context.render(this.root);
  }
}
const app = new Application({
  scenes: { ReverbAndDelayScene },
  canvas: {
    width: 1280,
    height: 720,
    mount: document.body,
    sizing: new FixedResolutionCanvasSizing(),
  },
  clearColor: Color.black,
  loader: {
    basePath: 'assets/',
  },
});
await app.start(ReverbAndDelayScene);
