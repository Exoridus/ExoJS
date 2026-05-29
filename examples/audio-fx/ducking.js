import { Application, AudioBus, Color, DuckingFilter, Music, Scene, Sound, Text } from '@codexo/exojs';

const assets = globalThis.assets;

const app = new Application({
    canvas: {
        width: 800,
        height: 600,
    },
    clearColor: Color.black,
});

document.body.append(app.canvas);

app.start(
    new (class extends Scene {
        async load(loader) {
            const musicUrl = assets?.audio?.example ?? 'assets/demo/audio/example.ogg';
            const voiceUrl = assets?.audio?.uiConfirm ?? 'assets/demo/audio/ui-confirm.ogg';
            await loader.load(Music, { music: musicUrl });
            await loader.load(Sound, { voice: voiceUrl });
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
        draw(context) {
            context.backend.clear();
            context.render(this._text);
        }
    })()
);
