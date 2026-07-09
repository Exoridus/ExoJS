// Auto-generated from falloff-curves.ts — edit the .ts source, not this file.
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
// Horizontal placement (0..1 of canvas width) for each source; absolute pixel
// positions are resolved against the canvas in init().
const MODELS = [
    { model: 'linear', tx: 0.25, color: new Color(255, 140, 140) },
    { model: 'inverse', tx: 0.5, color: new Color(140, 200, 255) },
    { model: 'exponential', tx: 0.75, color: new Color(200, 255, 140) },
];
const REF_DISTANCE = 60;
const MAX_DISTANCE = 460;
const ROLLOFF = 1;
function attenuation(model, d) {
    if (d <= REF_DISTANCE)
        return 1;
    if (model === 'linear') {
        return Math.max(0, 1 - ROLLOFF * ((d - REF_DISTANCE) / (MAX_DISTANCE - REF_DISTANCE)));
    }
    if (model === 'inverse') {
        return REF_DISTANCE / (REF_DISTANCE + ROLLOFF * (d - REF_DISTANCE));
    }
    return Math.pow(d / REF_DISTANCE, -ROLLOFF);
}
class FalloffCurvesScene extends Scene {
    listener;
    sources;
    sounds;
    graphics;
    labels;
    tapPrompt;
    // Canvas-relative plot geometry computed in init().
    plot = { x: 0, y: 0, w: 0, h: 0 };
    hud;
    async load(loader) {
        await loader.load('audio/impact-light.ogg');
    }
    init(loader) {
        const { width, height } = this.app.canvas;
        // Sources spread across the lower half; the listener starts centred.
        const sourceY = height * 0.72;
        this.sources = MODELS.map(({ model, color, tx }) => ({ model, color, x: width * tx, y: sourceY }));
        this.plot = { x: width * 0.06, y: height * 0.16, w: width * 0.88, h: height * 0.18 };
        this.listener = { x: width / 2, y: height / 2 };
        app.audio.listener.target = this.listener;
        this.sounds = this.sources.map(({ model, x, y }) => {
            const sound = new Sound(loader.get('audio/impact-light.ogg').audioBuffer, {
                distanceModel: model,
                refDistance: REF_DISTANCE,
                maxDistance: MAX_DISTANCE,
                rolloffFactor: ROLLOFF,
            });
            sound.position = { x, y };
            return sound;
        });
        this.graphics = new Graphics();
        this.labels = this.sources.map(({ model, x, y }) => {
            const label = new Text(model, { fillColor: Color.white, fontSize: 16, align: 'center' });
            label.setAnchor(0.5, 0).setPosition(x, y + 30);
            return label;
        });
        // Shown while the browser still blocks audio (`app.audio.locked`); the
        // first click or keypress unlocks it and the queued loops start.
        this.tapPrompt = new Text('Click or press any key to start audio', { fillColor: Color.white, fontSize: 22, align: 'center' })
            .setAnchor(0.5, 0.5)
            .setPosition(width / 2, height - 24);
        this.hud = mountControls({
            title: 'Falloff Curves',
            controls: [{ keys: 'Move', action: 'relocate the listener' }],
            status: 'Click or press any key to start…',
            hint: 'Each source uses a different distance model — move the listener to compare attenuation.',
        });
        this.app.input.onPointerMove.add(pointer => {
            this.listener.x = pointer.x;
            this.listener.y = pointer.y;
        });
        // Core defers playback until the AudioContext unlocks on the first
        // gesture, then starts automatically — just call play().
        for (const sound of this.sounds)
            this.app.audio.play(sound, { loop: true, volume: 0.5 });
        this.hud.setStatus('Move the pointer to relocate the listener');
    }
    draw(context) {
        context.backend.clear();
        this.graphics.clear();
        // Falloff-curve plots in the upper canvas area.
        const { x: plotX, y: plotY, w: plotW, h: plotH } = this.plot;
        this.graphics.fillColor = new Color(40, 40, 50);
        this.graphics.drawRectangle(plotX, plotY, plotW, plotH);
        for (const { model, color } of this.sources) {
            this.graphics.fillColor = color;
            for (let i = 0; i < plotW; i += 2) {
                const d = (i / plotW) * MAX_DISTANCE * 1.2;
                const v = attenuation(model, d);
                this.graphics.drawRectangle(plotX + i, plotY + plotH - v * plotH, 2, 2);
            }
        }
        // Listener marker.
        this.graphics.fillColor = new Color(120, 255, 160);
        this.graphics.drawCircle(this.listener.x, this.listener.y, 10);
        // Source markers + live attenuation readouts.
        for (let i = 0; i < this.sources.length; i++) {
            const { x, y, color, model } = this.sources[i];
            const dx = x - this.listener.x;
            const dy = y - this.listener.y;
            const d = Math.sqrt(dx * dx + dy * dy);
            const v = attenuation(model, d);
            this.graphics.fillColor = color;
            this.graphics.drawCircle(x, y, 18);
            this.graphics.fillColor = new Color(255, 255, 255, Math.floor(v * 255));
            this.graphics.drawCircle(x, y, 6);
            this.labels[i].text = `${model}\nvol ${v.toFixed(2)}`;
        }
        context.render(this.graphics);
        for (const label of this.labels)
            context.render(label);
        if (this.app.audio.locked) {
            context.render(this.tapPrompt);
        }
    }
}
app.start(new FalloffCurvesScene());
