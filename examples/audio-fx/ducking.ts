import { assets } from '@assets';
import { Application, AudioBus, Color, DuckingFilter, Music, Scene, Sound, Text } from '@codexo/exojs';

const app = new Application({
    canvas: {
        width: 800,
        height: 600,
    },
    clearColor: Color.black,
});

document.body.append(app.canvas);

class DuckingScene extends Scene {
    private music!: Music;
    private voice!: Sound;
    private voiceBus!: AudioBus;
    private ducking!: DuckingFilter;
    private text!: Text;

    override async load(loader): Promise<void> {
        await loader.load(Music, { music: assets.demo.audio.musicLoop });
        await loader.load(Sound, { voice: assets.demo.audio.uiConfirm });
    }

    override init(loader): void {
        this.music = loader.get(Music, 'music').setLoop(true).setVolume(0.7).play();
        this.voice = loader.get(Sound, 'voice');
        this.voiceBus = new AudioBus('voice-over', { parent: app.audio.master });
        app.audio.registerBus(this.voiceBus);
        this.voice.bus = this.voiceBus;
        this.ducking = new DuckingFilter({ sidechain: this.voiceBus, threshold: -30, ratio: 6, attackMs: 25, releaseMs: 260 });
        app.audio.music.addFilter(this.ducking);
        this.text = new Text('Click to play voice-over and duck music', { fillColor: Color.white, fontSize: 24 });
        this.text.setPosition(140, 280);
        this.app.input.onPointerTap.add(() => {
            this.voice.play({ replace: true });
        });
    }

    override draw(context): void {
        context.backend.clear();
        context.render(this.text);
    }
}

app.start(new DuckingScene());
