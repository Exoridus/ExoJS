// Auto-generated from audio-buses.ts - edit the .ts source, not this file.
import { Application, Asset, Color, FixedResolutionCanvasSizing, Scene, Text } from '@codexo/exojs';
import { mountControlPanel, mountControls } from '@examples/runtime';
class AudioBusesScene extends Scene {
  music;
  sfx;
  musicVoice;
  diagram;
  panel;
  hud;
  async load() {
    this.music = await this.loader.load(Asset.type('music', assets.demo.audio.musicLoop));
    this.sfx = this.loader.get(assets.demo.audio.uiClick);
  }
  init() {
    const audio = this.app.audio;
    this.diagram = new Text('Master\n  + Music: looping track\n  + Sound: click effect', { fillColor: Color.white, fontSize: 26 });
    this.diagram.setPosition(420, 180);
    this.hud = mountControls({
      title: 'Audio Mixer Buses',
      status: 'Music is routed to Music. The button routes each click to Sound.',
      hint: 'Master changes both children; Music and Sound affect only their own voices.',
    });
    this.panel = mountControlPanel({ title: 'Mixer' });
    this.panel.addSlider({
      label: 'Master',
      min: 0,
      max: 1,
      step: 0.01,
      value: audio.master.volume,
      onChange: value => {
        audio.master.volume = value;
      },
    });
    this.panel.addSlider({
      label: 'Music',
      min: 0,
      max: 1,
      step: 0.01,
      value: audio.music.volume,
      onChange: value => {
        audio.music.volume = value;
      },
    });
    this.panel.addSlider({
      label: 'Sound',
      min: 0,
      max: 1,
      step: 0.01,
      value: audio.sound.volume,
      onChange: value => {
        audio.sound.volume = value;
      },
    });
    this.panel.addButton({
      label: 'Play sound effect',
      onClick: () => {
        audio.play(this.sfx, { bus: audio.sound });
      },
    });
    this.musicVoice = audio.play(this.music, { bus: audio.music, loop: true, volume: 0.6 });
  }
  draw(context) {
    context.render(this.diagram);
  }
  destroy() {
    this.musicVoice?.stop();
    this.panel?.dispose();
    this.hud?.dispose();
    this.diagram?.destroy();
    super.destroy();
  }
}
const app = new Application({
  scenes: { AudioBusesScene },
  canvas: { width: 1280, height: 720, mount: document.body, sizing: new FixedResolutionCanvasSizing() },
  clearColor: Color.black,
});
await app.start(AudioBusesScene);
