// Auto-generated from play-sound.ts - edit the .ts source, not this file.
import { Application, Color, FixedResolutionCanvasSizing, Scene, Text } from '@codexo/exojs';
import { demoAssets as assets } from '@codexo/exojs-demo-assets';
// A small pool of different UI sounds so repeated taps stay interesting.
const SOUNDS = [
  { name: 'UI click', asset: assets.soundUiClick },
  { name: 'UI confirm', asset: assets.soundUiConfirm },
  { name: 'UI bong', asset: assets.soundUiBong },
  { name: 'Light impact', asset: assets.soundImpactLight },
  { name: 'Heavy impact', asset: assets.soundImpactHeavy },
];
class PlaySoundScene extends Scene {
  onPointerTap = () => {
    // Cycle through the pool so each tap plays a different sound.
    const sound = this.sounds[this.index];
    this.index = (this.index + 1) % this.sounds.length;
    this.app.audio.play(sound);
    this.text.text = `Playing: ${SOUNDS[(this.index + this.sounds.length - 1) % this.sounds.length].name}`;
  };
  sounds;
  text;
  index = 0;
  init() {
    const app = this.app;
    const { width, height } = app;
    // Keep example SFX comfortable - full volume is jarring in the docs.
    app.audio.sound.volume = 0.5;
    this.sounds = SOUNDS.map(sound => this.loader.get(sound.asset));
    this.text = new Text('Click anywhere to play SFX', { fillColor: Color.white, fontSize: 24, align: 'center' })
      .setAnchor(0.5, 0.5)
      .setPosition(width / 2, height / 2);
    this.app.input.onPointerTap.add(this.onPointerTap);
  }
  draw(context) {
    context.render(this.text);
  }
  destroy() {
    this.app.input.onPointerTap.remove(this.onPointerTap);
    this.text?.destroy();
    super.destroy();
  }
}
const app = new Application({
  scenes: { PlaySoundScene },
  canvas: {
    width: 1280,
    height: 720,
    mount: document.body,
    sizing: new FixedResolutionCanvasSizing(),
  },
  clearColor: Color.black,
});
await app.start(PlaySoundScene);
