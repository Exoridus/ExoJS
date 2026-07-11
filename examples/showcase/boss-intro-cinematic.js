// Auto-generated from boss-intro-cinematic.ts — edit the .ts source, not this file.
import { Application, Asset, Color, Graphics, Keyboard, Scene, Sprite, Text, View } from '@codexo/exojs';
import { mountControls } from '@examples/runtime';
const app = new Application({
    canvas: {
        width: 1280,
        height: 720,
        mount: document.body,
        sizingMode: 'fit',
    },
    clearColor: Color.black,
});
const titleText = 'VOID EMPEROR';
class BossIntroCinematicScene extends Scene {
    view;
    bg;
    bars;
    barSize;
    title;
    titleState;
    boss;
    music;
    musicVoice;
    hud;
    tapPrompt;
    width = 0;
    height = 0;
    init() {
        const app = this.app;
        if (app === null)
            throw new Error('Scene.app is unavailable before the scene is attached to an Application.');
        const { width, height } = app.canvas;
        this.width = width;
        this.height = height;
        // Start the camera left of the boss so the push-in sweeps across to it.
        this.view = new View(width * 0.42, height / 2, width, height);
        this.bg = new Graphics();
        this.bars = new Graphics();
        this.barSize = { v: 0 };
        this.title = new Text('', { fillColor: Color.white, fontSize: 56, fontWeight: 'bold' });
        this.title.setPosition(width * 0.12, height * 0.2);
        this.titleState = { count: 0 };
        this.boss = new Sprite(this.loader.get(assets.demo.textures.shipA))
            .setAnchor(0.5)
            .setScale(0.4)
            .setPosition(width * 0.62, height / 2)
            .setTint(new Color(255, 130, 130));
        this.music = this.loader.get(Asset.kind('music', assets.demo.music.loopMain));
        this.hud = mountControls({
            title: 'Boss Intro Cinematic',
            controls: [
                { keys: ['R', 'Click'], action: 'replay sequence' },
            ],
            status: 'Playing…',
            hint: 'Push-in, letterbox bars, a typewriter title reveal, and a screen shake punched on the reveal beat.',
        });
        // Shown while the browser still blocks audio (`app.audio.locked`); the
        // first click or keypress unlocks it and the sting + cinematic start.
        this.tapPrompt = new Text('Click or press any key to start the cinematic', { fillColor: Color.white, fontSize: 22, align: 'center' })
            .setAnchor(0.5, 0.5)
            .setPosition(width / 2, height - 64);
        // Core defers playback until the AudioContext unlocks on the first
        // gesture; start the cinematic in lockstep with the sting on unlock.
        this.musicVoice = app.audio.play(this.music, { loop: true, volume: 0.2 });
        app.audio.onUnlock.add(() => this.playSequence());
        this.inputs.onTrigger(Keyboard.R, () => this.replay());
        app.input.onPointerDown.add(() => this.replay());
    }
    replay() {
        const app = this.app;
        if (app === null)
            throw new Error('Scene.app is unavailable before the scene is attached to an Application.');
        if (app.audio.locked) {
            return;
        }
        // Restart the sting from the top so the reveal beat lines up again.
        this.musicVoice.seek(0);
        this.musicVoice.volume = 0.2;
        if (this.musicVoice.paused) {
            this.musicVoice.resume();
        }
        this.playSequence();
        this.hud.setStatus('Replaying…');
    }
    playSequence() {
        const app = this.app;
        if (app === null)
            throw new Error('Scene.app is unavailable before the scene is attached to an Application.');
        const { width, height } = this;
        // Wipe any in-flight tweens and reset the visible state to frame zero.
        app.tweens.clear();
        this.view.reset(width * 0.42, height / 2, width, height);
        this.view.stopShake();
        this.barSize.v = 0;
        this.titleState.count = 0;
        this.title.text = '';
        this.boss.setScale(0.4);
        // Letterbox bars slam in.
        app.tweens.create(this.barSize).to({ v: 84 }, 0.6).start();
        // Slow camera push-in toward the boss.
        app.tweens.create(this.view.center).to({ x: width * 0.55, y: height / 2 }, 2.0).start();
        // The boss looms larger as the camera arrives.
        app.tweens.create(this.boss.scale).to({ x: 2.1, y: 2.1 }, 1.8).delay(1.1).start();
        // Typewriter title reveal — its onStart IS the reveal beat: punch a shake.
        app.tweens
            .create(this.titleState)
            .to({ count: titleText.length }, 1.0)
            .delay(1.6)
            .onStart(() => {
            this.view.shake(18, 520, { frequency: 24, decay: true });
        })
            .onUpdate(() => {
            this.title.text = titleText.slice(0, this.titleState.count | 0);
        })
            .start();
        // Music swells up under the reveal.
        app.tweens.create(this.musicVoice).to({ volume: 0.85 }, 2.0).start();
    }
    update(delta) {
        // Advance the camera shake (and follow/bounds) animation each frame.
        this.view.update(delta.milliseconds);
    }
    draw(context) {
        const app = this.app;
        if (app === null)
            throw new Error('Scene.app is unavailable before the scene is attached to an Application.');
        const { width, height } = this;
        context.backend.clear(new Color(16, 16, 24));
        this.bg.clear();
        this.bg.fillColor = new Color(36, 42, 70);
        // Span well past the view edges so the push-in never reveals a seam.
        this.bg.drawRectangle(-width * 0.25, 0, width * 1.5, height);
        context.backend.setView(this.view);
        context.render(this.bg);
        context.render(this.boss);
        context.backend.setView(null);
        context.render(this.title);
        this.bars.clear();
        this.bars.fillColor = Color.black;
        this.bars.drawRectangle(0, 0, width, this.barSize.v);
        this.bars.drawRectangle(0, height - this.barSize.v, width, this.barSize.v);
        context.render(this.bars);
        if (app.audio.locked) {
            context.render(this.tapPrompt);
        }
    }
}
app.start(new BossIntroCinematicScene());
