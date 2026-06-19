// Auto-generated from listener-and-source.ts — edit the .ts source, not this file.
import { Application, Color, Graphics, Scene, Sound, Text } from '@codexo/exojs';
import { mountControls } from '@examples/runtime';
const app = new Application({
    canvas: {
        width: 1280,
        height: 720,
        mount: document.body,
        sizingMode: 'fit',
    },
    clearColor: Color.black,
    loader: {
        basePath: 'assets/',
    },
});
// Spatial parameters tuned to the canvas so attenuation is visible across the
// wide 1280px canvas. These mirror the Web Audio `linear` model (see
// DistanceModel in src/audio/Sound.ts) so the on-screen readout matches what
// you hear.
const REF_DISTANCE = 50;
const MAX_DISTANCE = 560;
const ROLLOFF = 1;
const SOURCE_RADIUS = 24;
function linearAttenuation(distance) {
    if (distance <= REF_DISTANCE)
        return 1;
    const t = (distance - REF_DISTANCE) / (MAX_DISTANCE - REF_DISTANCE);
    return Math.max(0, 1 - ROLLOFF * t);
}
class ListenerAndSourceScene extends Scene {
    sound;
    dragging = false;
    listener;
    graphics;
    label;
    tapPrompt;
    hud;
    async load(loader) {
        await loader.load(Sound, { source: 'audio/impact-light.ogg' });
    }
    init(loader) {
        const { width, height } = this.app.canvas;
        this.sound = new Sound(loader.get(Sound, 'source').audioBuffer, {
            distanceModel: 'linear',
            refDistance: REF_DISTANCE,
            maxDistance: MAX_DISTANCE,
            rolloffFactor: ROLLOFF,
        });
        this.listener = { x: width / 2, y: height / 2 };
        this.sound.position = { x: width / 2 + 220, y: height / 2 };
        app.audio.listener.target = this.listener;
        this.graphics = new Graphics();
        this.label = new Text('', { fillColor: Color.white, fontSize: 17 });
        this.label.setPosition(20, 20);
        // Shown while the browser still blocks audio (`app.audio.locked`); the
        // first click or keypress unlocks it and the queued loop starts.
        this.tapPrompt = new Text('Click or press any key to start audio', { fillColor: Color.white, fontSize: 22, align: 'center' })
            .setAnchor(0.5, 0.5)
            .setPosition(width / 2, height - 48);
        this.hud = mountControls({
            title: 'Listener and Source',
            controls: [{ keys: 'Drag', action: 'move the red source around the listener' }],
            status: 'Click or press any key to start…',
            hint: 'The green dot is the listener. Drag the red source — volume falls off with distance.',
        });
        this.app.input.onPointerDown.add(pointer => {
            const source = this.sound.position;
            if (!source)
                return;
            const dx = pointer.x - source.x;
            const dy = pointer.y - source.y;
            // Generous grab radius so the source is easy to pick up.
            if (dx * dx + dy * dy < SOURCE_RADIUS * SOURCE_RADIUS * 4)
                this.dragging = true;
        });
        this.app.input.onPointerMove.add(pointer => {
            if (!this.dragging)
                return;
            this.sound.position = { x: pointer.x, y: pointer.y };
        });
        this.app.input.onPointerUp.add(() => {
            this.dragging = false;
        });
        // Core defers playback until the AudioContext unlocks on the first
        // gesture, then starts automatically — just call play().
        this.app.audio.play(this.sound, { loop: true, volume: 1 });
        this.hud.setStatus('Drag the red source to move it');
    }
    draw(context) {
        const source = this.sound.position ?? { x: 0, y: 0 };
        const dx = source.x - this.listener.x;
        const dy = source.y - this.listener.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const volume = linearAttenuation(dist);
        // Horizontal offset maps to stereo pan (left of listener = left ear).
        const pan = Math.max(-1, Math.min(1, dx / MAX_DISTANCE));
        const panText = pan < -0.05 ? `L ${Math.abs(pan).toFixed(2)}` : pan > 0.05 ? `R ${pan.toFixed(2)}` : 'center';
        this.label.text = `distance: ${dist.toFixed(0)} px   volume: ${(volume * 100).toFixed(0)}%   pan: ${panText}`;
        context.backend.clear();
        this.graphics.clear();
        // Reference + max distance rings around the listener.
        this.graphics.fillColor = new Color(50, 60, 60);
        this.graphics.drawCircle(this.listener.x, this.listener.y, MAX_DISTANCE);
        this.graphics.fillColor = new Color(0, 0, 0);
        this.graphics.drawCircle(this.listener.x, this.listener.y, MAX_DISTANCE - 2);
        // Listener.
        this.graphics.fillColor = new Color(120, 255, 160);
        this.graphics.drawCircle(this.listener.x, this.listener.y, 14);
        // Source — brightness tracks attenuation so volume reads visually too.
        const glow = Math.floor(80 + volume * 175);
        this.graphics.fillColor = new Color(glow, Math.floor(80 + volume * 60), Math.floor(80 + volume * 60));
        this.graphics.drawCircle(source.x, source.y, SOURCE_RADIUS);
        context.render(this.graphics);
        context.render(this.label);
        if (this.app.audio.locked) {
            context.render(this.tapPrompt);
        }
    }
}
app.start(new ListenerAndSourceScene());
