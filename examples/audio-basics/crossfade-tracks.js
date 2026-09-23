// Auto-generated from crossfade-tracks.ts - edit the .ts source, not this file.
import { Application, Asset, Color, crossFade, FixedResolutionCanvasSizing, Graphics, Scene, Text, Time } from '@codexo/exojs';
import { mountControlPanel, mountControls } from '@examples/runtime';
const PEAK = 0.7;
const COLOR_A = new Color(120, 200, 255);
const COLOR_B = new Color(255, 160, 120);
const METER_W = 120;
const METER_H = 320;
class CrossfadeTracksScene extends Scene {
  trackA;
  trackB;
  trackAVoice;
  trackBVoice;
  mix = 0;
  fadeFrom = 0;
  fadeTo = 0;
  fadeElapsed = 2;
  fadeDuration = 2;
  graphics;
  labelA;
  labelB;
  nowPlaying;
  tapPrompt;
  // Canvas-relative layout computed in init().
  meterAX = 0;
  meterBX = 0;
  meterBaseY = 0;
  hud;
  panel;
  async load() {
    const app = this.app;
    const { width, height } = app;
    // Spread the two meters across the wide canvas: each sits a third of the
    // way in from its side, centred on the meter width.
    this.meterAX = width * 0.33 - METER_W / 2;
    this.meterBX = width * 0.67 - METER_W / 2;
    this.meterBaseY = height * 0.82;
    // AudioStream is a non-leaf resource kind (no seamless placeholder), so each
    // track is loaded directly through `Asset.type('music', ...)` and awaited. Both
    // tracks loop; the crossfade only swaps which one is audible.
    [this.trackA, this.trackB] = await Promise.all([
      this.loader.load(Asset.type('music', assets.demo.audio.musicA)),
      this.loader.load(Asset.type('music', assets.demo.audio.musicB)),
    ]);
    this.graphics = new Graphics();
    this.labelA = new Text('Track A', { fillColor: Color.white, fontSize: 22, align: 'center' })
      .setAnchor(0.5, 0.5)
      .setPosition(this.meterAX + METER_W / 2, height * 0.26);
    this.labelB = new Text('Track B', { fillColor: Color.white, fontSize: 22, align: 'center' })
      .setAnchor(0.5, 0.5)
      .setPosition(this.meterBX + METER_W / 2, height * 0.26);
    this.nowPlaying = new Text('', { fillColor: Color.white, fontSize: 20, align: 'center' }).setAnchor(0.5, 0.5).setPosition(width / 2, height * 0.15);
    // Shown while the browser still blocks audio (`app.audio.locked`); the
    // first click or keypress unlocks it and the queued music starts.
    this.tapPrompt = new Text('Click or press any key to start audio', { fillColor: Color.white, fontSize: 22, align: 'center' })
      .setAnchor(0.5, 0.5)
      .setPosition(width / 2, height - 48);
    this.hud = mountControls({
      title: 'Crossfade Tracks',
      controls: [{ keys: 'Choose A or B', action: 'crossfade between looping tracks (2s)' }],
      status: 'Click or press any key to start…',
      hint: 'The meter follows the same two-second interval scheduled for the voice gains.',
    });
    this.panel = mountControlPanel({ title: 'Select track' });
    this.panel.addButton({ label: 'Track A', onClick: () => this.selectTrack(0) });
    this.panel.addButton({ label: 'Track B', onClick: () => this.selectTrack(1) });
    // Core defers playback until the AudioContext unlocks on the first
    // gesture, then starts automatically - start both loops (B silent) so
    // crossFade only has to ramp gains rather than start playback mid-fade.
    this.trackAVoice = app.audio.play(this.trackA, { loop: true, volume: PEAK });
    this.trackBVoice = app.audio.play(this.trackB, { loop: true, volume: 0 });
    this.hud.setStatus('Track A active - choose a track to crossfade.');
  }
  selectTrack(target) {
    if (this.app.audio.locked || this.fadeElapsed < this.fadeDuration || target === this.mix) return;
    this.fadeFrom = this.mix;
    this.fadeTo = target;
    this.fadeElapsed = 0;
    if (target === 1) void crossFade(this.trackAVoice, this.trackBVoice, Time.seconds(this.fadeDuration), { toVolume: PEAK, stopAfter: false });
    else void crossFade(this.trackBVoice, this.trackAVoice, Time.seconds(this.fadeDuration), { toVolume: PEAK, stopAfter: false });
    this.hud.setStatus(`Crossfading to Track ${target === 1 ? 'B' : 'A'}…`);
  }
  update(delta) {
    if (this.fadeElapsed >= this.fadeDuration) return;
    this.fadeElapsed = Math.min(this.fadeDuration, this.fadeElapsed + delta);
    this.mix = this.fadeFrom + (this.fadeTo - this.fadeFrom) * (this.fadeElapsed / this.fadeDuration);
    if (this.fadeElapsed === this.fadeDuration) this.hud.setStatus(`Track ${this.fadeTo === 1 ? 'B' : 'A'} active.`);
  }
  drawMeter(x, level, active, color) {
    const height = METER_H;
    const baseY = this.meterBaseY;
    const width = METER_W;
    // Background trough.
    this.graphics.fillColor = new Color(45, 45, 45);
    this.graphics.drawRectangle(x, baseY - height, width, height);
    // Filled level (volume 0..PEAK mapped to full height). The inactive
    // track dims to ~45% so the active one reads as the bright one.
    const fill = Math.max(0, Math.min(1, level / PEAK));
    const lit = active ? color : new Color(color.r * 0.45, color.g * 0.45, color.b * 0.45);
    this.graphics.fillColor = lit;
    this.graphics.drawRectangle(x, baseY - height * fill, width, height * fill);
    // Active-track marker bar above the meter.
    if (active) {
      this.graphics.fillColor = new Color(255, 255, 255);
      this.graphics.drawRectangle(x, baseY - height - 12, width, 5);
    }
  }
  draw(context) {
    const app = this.app;
    this.graphics.clear();
    const aLevel = PEAK * (1 - this.mix);
    const bLevel = PEAK * this.mix;
    const aActive = aLevel >= bLevel;
    this.drawMeter(this.meterAX, aLevel, aActive, COLOR_A);
    this.drawMeter(this.meterBX, bLevel, !aActive, COLOR_B);
    this.labelA.text = `Track A  ${Math.round((aLevel / PEAK) * 100)}%`;
    this.labelB.text = `Track B  ${Math.round((bLevel / PEAK) * 100)}%`;
    this.nowPlaying.text = `Active: Track ${aActive ? 'A' : 'B'}`;
    context.render(this.graphics);
    context.render(this.labelA);
    context.render(this.labelB);
    context.render(this.nowPlaying);
    if (app.audio.locked) {
      context.render(this.tapPrompt);
    }
  }
  destroy() {
    this.trackAVoice?.stop();
    this.trackBVoice?.stop();
    this.panel?.dispose();
    this.hud?.dispose();
    this.graphics?.destroy();
    this.labelA?.destroy();
    this.labelB?.destroy();
    this.nowPlaying?.destroy();
    this.tapPrompt?.destroy();
    super.destroy();
  }
}
const app = new Application({
  scenes: { CrossfadeTracksScene },
  canvas: {
    width: 1280,
    height: 720,
    mount: document.body,
    sizing: new FixedResolutionCanvasSizing(),
  },
  clearColor: Color.black,
});
await app.start(CrossfadeTracksScene);
