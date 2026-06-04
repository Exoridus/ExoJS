import { Application, AudioBus, Color, Music, OscillatorSound, Scene, Text, VocoderFilter } from '@codexo/exojs';

const app = new Application({
    canvas: {
        width: 800,
        height: 600,
    },
    clearColor: Color.black,
    loader: {
        basePath: 'assets/',
    },
});

document.body.append(app.canvas);

class VocoderScene extends Scene {
    private _modBus!: AudioBus;
    private _mod!: Music;
    private _carrier!: OscillatorSound;
    private _vocoder!: VocoderFilter;
    private _active = false;
    private _text!: Text;

    override async load(loader): Promise<void> {
        await loader.load(Music, { mod: 'audio/demo-loop-main.ogg' });
    }

    override init(loader): void {
        this._modBus = new AudioBus('modulator', { parent: app.audio.master });
        app.audio.registerBus(this._modBus);
        this._mod = loader.get(Music, 'mod').setLoop(true).setVolume(0.9);
        this._mod.bus = this._modBus;
        this._carrier = new OscillatorSound({ frequency: 110, type: 'sawtooth', volume: 0.4 });
        this._vocoder = new VocoderFilter({ modulator: this._modBus, numBands: 14, wet: 1.0 });
        app.audio.sound.addFilter(this._vocoder);
        this._text = new Text('Click to toggle vocoder (voice mod + saw carrier)', { fillColor: Color.white, fontSize: 22 });
        this._text.setPosition(120, 280);

        this.app.input.onPointerTap.add(() => {
            this._active = !this._active;
            if (this._active) {
                this._mod.play();
                this._carrier.play({ replace: true });
            } else {
                this._mod.pause();
                this._carrier.pause();
            }
        });
    }

    override draw(context): void {
        context.backend.clear();
        context.render(this._text);
    }
}

app.start(new VocoderScene());
