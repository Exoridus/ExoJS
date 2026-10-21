import {
  Application,
  type AudioStream,
  Color,
  FixedResolutionCanvasSizing,
  type RenderingContext,
  Scene,
  type Sound,
  Text,
  type Voice,
} from '@codexo/exojs';
import { demoAssets as assets } from '@codexo/exojs-demo-assets';
import { type DemoPanel, demoPanel, slider, type SliderSpec } from '@examples/runtime';

class AudioBusesScene extends Scene {
  private music!: AudioStream;
  private sfx!: Sound;
  private musicVoice!: Voice;
  private diagram!: Text;
  private panel!: DemoPanel<{ master: SliderSpec; music: SliderSpec; sound: SliderSpec }>;
  private prompt!: Text;

  override async load(): Promise<void> {
    this.music = await this.loader.load(assets.musicLoopMain);
    this.sfx = this.loader.get(assets.soundUiClick);
  }

  override init(): void {
    const audio = this.app.audio;
    this.diagram = new Text('Master\n  + Music: looping track\n  + Sound: click effect', { fillColor: Color.white, fontSize: 26 });
    this.diagram.setPosition(420, 180);

    this.panel = demoPanel({
      title: 'Mixer',
      controls: {
        master: slider('Master', { min: 0, max: 1, step: 0.01, value: audio.master.volume }),
        music: slider('Music', { min: 0, max: 1, step: 0.01, value: audio.music.volume }),
        sound: slider('Sound', { min: 0, max: 1, step: 0.01, value: audio.sound.volume }),
      },
      actions: { 'Play sound effect': () => audio.play(this.sfx, { bus: audio.sound, volume: 0.5 }) },
      onChange: (key, value) => {
        audio[key].volume = value;
      },
    });

    // The track waits for the first gesture to unlock audio, then starts.
    this.prompt = new Text('Click or press any key to start the music', { fillColor: Color.white, fontSize: 22 }).setPosition(420, 420);
    this.musicVoice = audio.play(this.music, { bus: audio.music, loop: true, volume: 0.6 });
  }

  override draw(context: RenderingContext): void {
    context.render(this.diagram);

    if (this.app.audio.locked) {
      context.render(this.prompt);
    }
  }

  override destroy(): void {
    this.musicVoice?.stop();
    this.panel?.dispose();
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
