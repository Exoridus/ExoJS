// Auto-generated from audio-buses.ts — edit the .ts source, not this file.
import { Application, Asset, Color, Graphics, Scene, Text } from '@codexo/exojs';
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
// Each row drives one of the three engine-built-in busses. `master` is the
// root; `music` and `sound` are its children, so the music/SFX bars scale
// their own bus while the master bar scales everything downstream.
const rows = [
    { name: 'Master', color: new Color(255, 180, 120), bus: () => app.audio.master },
    { name: 'Music', color: new Color(120, 200, 255), bus: () => app.audio.music },
    { name: 'SFX', color: new Color(130, 255, 170), bus: () => app.audio.sound },
];
class AudioBusesScene extends Scene {
    music;
    sfx;
    graphics;
    labels;
    sfxLabel;
    tapPrompt;
    drag = -1;
    // Layout (canvas-relative), computed in init() once the canvas size is known.
    trackX = 0;
    trackW = 0;
    rowY = [];
    sfxButton = { x: 0, y: 0, w: 0, h: 0 };
    hud;
    async init() {
        const app = this.app;
        if (app === null)
            throw new Error('Scene.app is unavailable before the scene is attached to an Application.');
        const { width, height } = app.canvas;
        // Centre the bus mixer horizontally and spread the bars across the wide
        // 16:9 canvas.
        this.trackW = width * 0.5;
        this.trackX = (width - this.trackW) / 2;
        this.rowY = rows.map((_, i) => height * 0.34 + i * 90);
        this.sfxButton = { x: width / 2 - 150, y: height * 0.74, w: 300, h: 36 };
        // AudioStream has no seamless adapter — await it explicitly.
        const music = await this.loader.load(Asset.kind('music', assets.demo.audio.musicLoop));
        this.music = music;
        // Path-only get() infers Sound from the .ogg extension — sidesteps a
        // compile-time overload ambiguity between Sound and the Json token form
        // (both have zero-arg-constructible instance types) when passing the
        // Sound token explicitly.
        this.sfx = this.loader.get(assets.demo.audio.uiClick);
        this.graphics = new Graphics();
        this.labels = rows.map((_, i) => new Text('', { fillColor: Color.white, fontSize: 18 }).setPosition(this.trackX - 50, this.rowY[i] - 34));
        this.sfxLabel = new Text('Play SFX  ▶', { fillColor: new Color(20, 20, 20), fontSize: 20 }).setPosition(this.sfxButton.x + 92, this.sfxButton.y + 7);
        // Shown while the browser still blocks audio (`app.audio.locked`); the
        // first click or keypress unlocks it and the queued music starts.
        this.tapPrompt = new Text('Click or press any key to start audio', { fillColor: Color.white, fontSize: 22, align: 'center' })
            .setAnchor(0.5, 0.5)
            .setPosition(width / 2, height - 48);
        this.hud = mountControls({
            title: 'Audio Buses',
            controls: [
                { keys: 'Drag', action: 'a bus bar to set its volume' },
                { keys: 'Click', action: '"Play SFX" (button near the bottom) to fire a clip' },
            ],
            status: 'Click or press any key to start the music…',
            hint: 'Master scales every bus; Music and SFX scale only their own. Bars show live volume, labels show it in dB.',
        });
        app.input.onPointerDown.add(p => {
            this.drag = this.rowFromY(p.y);
            this.updateSlider(p.x);
        });
        app.input.onPointerMove.add(p => {
            this.updateSlider(p.x);
        });
        app.input.onPointerUp.add(() => {
            this.drag = -1;
        });
        app.input.onPointerTap.add(p => {
            if (this.insideSfxButton(p.x, p.y)) {
                app.audio.play(this.sfx);
                this.hud.setStatus('SFX fired on the SFX bus — try lowering Master or SFX, then fire again.');
            }
        });
        // Core defers playback until the AudioContext unlocks on the first
        // gesture, then starts automatically.
        app.audio.play(this.music, { loop: true, volume: 0.6 });
        this.hud.setStatus('Music playing on the Music bus. Drag a bar to mix.');
    }
    rowFromY(y) {
        for (let i = 0; i < this.rowY.length; i++) {
            if (Math.abs(y - this.rowY[i]) <= 24)
                return i;
        }
        return -1;
    }
    insideSfxButton(x, y) {
        return x >= this.sfxButton.x && x <= this.sfxButton.x + this.sfxButton.w && y >= this.sfxButton.y && y <= this.sfxButton.y + this.sfxButton.h;
    }
    updateSlider(x) {
        if (this.drag < 0)
            return;
        const t = Math.max(0, Math.min(1, (x - this.trackX) / this.trackW));
        rows[this.drag].bus().volume = t;
    }
    draw(context) {
        const app = this.app;
        if (app === null)
            throw new Error('Scene.app is unavailable before the scene is attached to an Application.');
        context.backend.clear();
        this.graphics.clear();
        rows.forEach((row, index) => {
            const value = row.bus().volume;
            const db = 20 * Math.log10(Math.max(0.0001, value));
            this.labels[index].text = `${row.name}: ${db.toFixed(1)} dB`;
            // Trough.
            this.graphics.fillColor = new Color(55, 55, 55);
            this.graphics.drawRectangle(this.trackX, this.rowY[index] - 8, this.trackW, 16);
            // Filled level.
            this.graphics.fillColor = row.color;
            this.graphics.drawRectangle(this.trackX, this.rowY[index] - 8, this.trackW * value, 16);
        });
        // SFX trigger button.
        this.graphics.fillColor = new Color(200, 200, 200);
        this.graphics.drawRectangle(this.sfxButton.x, this.sfxButton.y, this.sfxButton.w, this.sfxButton.h);
        context.render(this.graphics);
        for (const label of this.labels)
            context.render(label);
        context.render(this.sfxLabel);
        if (app.audio.locked) {
            context.render(this.tapPrompt);
        }
    }
}
app.start(new AudioBusesScene());
