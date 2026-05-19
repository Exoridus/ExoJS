import { Application, AudioBus, Color, DuckingFilter, Music, Scene, Sound, Text } from '@codexo/exojs';

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

app.start(
    new (class extends Scene {
        async load(loader) {
            await loader.load(Music, { music: 'audio/example.ogg' });
            await loader.load(Sound, { voice: 'audio/example.ogg' });
        }
        init(loader) {
            this._music = loader.get(Music, 'music').setLoop(true).setVolume(0.7).play();
            this._voice = loader.get(Sound, 'voice');
            this._voiceBus = new AudioBus('voice-over', { parent: app.audio.master });
            app.audio.registerBus(this._voiceBus);
            this._voice.bus = this._voiceBus;
            this._ducking = new DuckingFilter({ sidechain: this._voiceBus, threshold: -30, ratio: 6, attackMs: 25, releaseMs: 260 });
            app.audio.music.addFilter(this._ducking);
            this._text = new Text('Click to play voice-over and duck music', { fill: 'white', fontSize: 24 });
            this._text.setPosition(140, 280);
            this.app.input.onPointerTap.add(() => {
                this._voice.play({ replace: true });
            });
        }
        draw(backend) {
            backend.clear();
            this._text.render(backend);
        }
    })()
);
