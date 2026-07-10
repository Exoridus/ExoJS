// Auto-generated from sound-pool.ts — edit the .ts source, not this file.
import { Application, Color, Graphics, Keyboard, Scene, Text } from '@codexo/exojs';
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
const POOL_SIZE = 12;
const FIRE_INTERVAL = 0.04;
class SoundPoolScene extends Scene {
    sound;
    graphics;
    label;
    readout;
    tapPrompt;
    firing = false;
    timer = 0;
    // End-times (seconds, scene clock) of the voices we have started, mirroring
    // the engine's pool: at most POOL_SIZE play concurrently and the oldest is
    // evicted when a new one arrives at capacity (FIFO).
    voices = [];
    clock = 0;
    evictions = 0;
    hud;
    init() {
        const { width, height } = this.app.canvas;
        // impactHeavy is long enough (~0.5 s) that rapid fire actually overlaps -
        // a short click ends before the next shot and the pool never fills.
        // Path-only get() infers Sound from the .ogg extension — sidesteps a
        // compile-time overload ambiguity between Sound and the Json token form
        // when passing the Sound token explicitly.
        this.sound = this.loader.get(assets.demo.audio.impactHeavy);
        this.sound.poolSize = POOL_SIZE;
        this.graphics = new Graphics();
        this.label = new Text('Hold Space to fire faster than voices finish', { fillColor: Color.white, fontSize: 22, align: 'center' })
            .setAnchor(0.5, 0.5)
            .setPosition(width / 2, height * 0.22);
        this.readout = new Text('', { fillColor: Color.white, fontSize: 20, align: 'center' })
            .setAnchor(0.5, 0.5)
            .setPosition(width / 2, height * 0.32);
        // Shown while the browser still blocks audio (`app.audio.locked`); the
        // first click or keypress unlocks it. Holding Space becomes audible once
        // a pointer gesture has unlocked the AudioContext.
        this.tapPrompt = new Text('Click or press any key to start audio', { fillColor: Color.white, fontSize: 22, align: 'center' })
            .setAnchor(0.5, 0.5)
            .setPosition(width / 2, height - 48);
        this.hud = mountControls({
            title: 'Sound Pool',
            controls: [
                { keys: 'Click', action: 'enable audio (once)' },
                { keys: 'Space', action: 'hold to spawn voices into the pool' },
            ],
            status: 'Click or press any key to enable audio, then hold Space.',
            hint: `The pool caps at ${POOL_SIZE} concurrent voices. Each slot below lights up while a voice plays; at capacity the oldest voice is evicted so playback never stacks unbounded.`,
        });
        this.inputs.onActive(Keyboard.Space, () => {
            this.firing = true;
        });
        this.inputs.onStop(Keyboard.Space, () => {
            this.firing = false;
        });
    }
    spawnVoice() {
        // Retire any voices that have finished naturally.
        this.voices = this.voices.filter(end => end > this.clock);
        // At capacity the engine evicts the oldest source; mirror that here.
        if (this.voices.length >= POOL_SIZE) {
            this.voices.shift();
            this.evictions += 1;
        }
        this.voices.push(this.clock + this.sound.duration);
        // Small random pitch per shot keeps the barrage from sounding robotic.
        this.app.audio.play(this.sound, { playbackRate: 0.85 + Math.random() * 0.3, volume: 0.5 });
    }
    update(delta) {
        this.clock += delta.seconds;
        // Drop voices that have ended this frame so the meter reads truthfully.
        this.voices = this.voices.filter(end => end > this.clock);
        // Core defers playback until the AudioContext unlocks on the first
        // gesture; skip firing while audio is still locked.
        if (!this.firing || this.app.audio.locked)
            return;
        this.timer += delta.seconds;
        while (this.timer >= FIRE_INTERVAL) {
            this.timer -= FIRE_INTERVAL;
            this.spawnVoice();
        }
    }
    draw(context) {
        context.backend.clear();
        this.graphics.clear();
        const active = this.voices.length;
        // Pool capacity meter: one cell per slot, lit while occupied.
        const cols = 6;
        const cell = 70;
        const gap = 12;
        const totalW = cols * cell + (cols - 1) * gap;
        const startX = (this.app.width - totalW) / 2;
        const startY = this.app.height * 0.42;
        for (let i = 0; i < POOL_SIZE; i++) {
            const col = i % cols;
            const rowI = Math.floor(i / cols);
            const x = startX + col * (cell + gap);
            const y = startY + rowI * (cell + gap);
            if (i < active) {
                this.graphics.fillColor = new Color(130, 255, 170);
            }
            else {
                this.graphics.fillColor = new Color(50, 55, 60);
            }
            this.graphics.drawRectangle(x, y, cell, cell);
        }
        this.readout.text = `Active voices: ${active} / ${POOL_SIZE}     evicted: ${this.evictions}`;
        context.render(this.graphics);
        context.render(this.label);
        context.render(this.readout);
        if (this.app.audio.locked) {
            context.render(this.tapPrompt);
        }
    }
}
app.start(new SoundPoolScene());
