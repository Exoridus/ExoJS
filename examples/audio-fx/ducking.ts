import { audio } from '@assets';
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
    private _music!: Music;
    private _voice!: Sound;
    private _voiceBus!: AudioBus;
    private _ducking!: DuckingFilter;
    private _text!: Text;

    override async load(loader): Promise<void> {
        await loader.load(Music, { music: audio.musicLoop });
        await loader.load(Sound, { voice: audio.uiConfirm });
    }

    override init(loader): void {
        this._music = loader.get(Music, 'music').setLoop(true).setVolume(0.7).play();
        this._voice = loader.get(Sound, 'voice');
        this._voiceBus = new AudioBus('voice-over', { parent: app.audio.master });
        app.audio.registerBus(this._voiceBus);
        this._voice.bus = this._voiceBus;
        this._ducking = new DuckingFilter({ sidechain: this._voiceBus, threshold: -30, ratio: 6, attackMs: 25, releaseMs: 260 });
        app.audio.music.addFilter(this._ducking);
        this._text = new Text('Click to play voice-over and duck music', { fillColor: Color.white, fontSize: 24 });
        this._text.setPosition(140, 280);
        this.app.input.onPointerTap.add(() => {
            this._voice.play({ replace: true });
        });
    }

    override draw(context): void {
        context.backend.clear();
        context.render(this._text);
    }
}

app.start(new DuckingScene());
