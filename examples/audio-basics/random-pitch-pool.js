// Auto-generated from random-pitch-pool.ts — edit the .ts source, not this file.
import { assets } from '@assets';
import { Application, Color, Keyboard, Scene, Sound, Text } from '@codexo/exojs';
const app = new Application({
    canvas: {
        width: 800,
        height: 600,
    },
    clearColor: Color.black,
});
document.body.append(app.canvas);
class RandomPitchPoolScene extends Scene {
    sound;
    text;
    active = false;
    timer = 0;
    async load(loader) {
        await loader.load(Sound, { blip: assets.demo.audio.impactLight });
    }
    init(loader) {
        this.sound = loader.get(Sound, 'blip');
        this.sound.poolSize = 20;
        this.text = new Text('Hold Space for random pitch detune', { fillColor: Color.white, fontSize: 24 });
        this.text.setPosition(170, 280);
        this.inputs.onActive(Keyboard.Space, () => {
            this.active = true;
        });
        this.inputs.onStop(Keyboard.Space, () => {
            this.active = false;
        });
    }
    update(delta) {
        if (!this.active)
            return;
        this.timer += delta.seconds;
        while (this.timer > 0.08) {
            this.timer -= 0.08;
            const cents = Math.random() * 400 - 200;
            this.sound.play({ playbackRate: Math.pow(2, cents / 1200) });
        }
    }
    draw(context) {
        context.backend.clear();
        context.render(this.text);
    }
}
app.start(new RandomPitchPoolScene());
