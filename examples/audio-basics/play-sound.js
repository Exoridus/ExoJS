// Auto-generated from play-sound.ts — edit the .ts source, not this file.
import { Application, Color, Scene, Text } from '@codexo/exojs';
const app = new Application({
    canvas: {
        width: 1280,
        height: 720,
        mount: document.body,
        sizingMode: 'fit',
    },
    clearColor: Color.black,
});
// A small pool of different UI sounds so repeated taps stay interesting.
const SOUND_KEYS = ['uiClick', 'uiConfirm', 'uiBong', 'impactLight', 'impactHeavy'];
class PlaySoundScene extends Scene {
    sounds;
    text;
    index = 0;
    init() {
        const { width, height } = this.app.canvas;
        // Keep example SFX comfortable — full volume is jarring in the docs.
        this.app.audio.sound.volume = 0.5;
        // Path-only get() infers Sound from the .ogg extension — sidesteps a
        // compile-time overload ambiguity between Sound and the Json token form
        // when passing the Sound token explicitly.
        this.sounds = SOUND_KEYS.map(key => this.loader.get(assets.demo.audio[key]));
        this.text = new Text('Click anywhere to play SFX', { fillColor: Color.white, fontSize: 24, align: 'center' })
            .setAnchor(0.5, 0.5)
            .setPosition(width / 2, height / 2);
        this.app.input.onPointerTap.add(() => {
            // Cycle through the pool so each tap plays a different sound.
            const sound = this.sounds[this.index];
            this.index = (this.index + 1) % this.sounds.length;
            this.app.audio.play(sound);
            this.text.text = `Playing: ${SOUND_KEYS[(this.index + this.sounds.length - 1) % this.sounds.length]}`;
        });
    }
    draw(context) {
        context.backend.clear();
        context.render(this.text);
    }
}
app.start(new PlaySoundScene());
