import { Application, AudioStream, Color, Graphics, Scene, Text } from '@codexo/exojs';
import { CompressorEffect } from '@codexo/exojs-audio-fx';
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

type CompressorParam = 'threshold' | 'ratio' | 'attack' | 'release';

interface SliderDef {
    key: CompressorParam;
    min: number;
    max: number;
}

const sliders: SliderDef[] = [
    { key: 'threshold', min: -60, max: 0 },
    { key: 'ratio', min: 1, max: 16 },
    { key: 'attack', min: 0.001, max: 0.2 },
    { key: 'release', min: 0.02, max: 0.8 },
];

class CompressorScene extends Scene {
    private music!: AudioStream;
    private filter!: CompressorEffect;
    private gfx!: Graphics;
    private labels!: Text[];
    private meterLabel!: Text;
    private tapPrompt!: Text;
    private drag = -1;
    // Canvas-relative bar layout computed in init().
    private barX = 0;
    private barW = 0;
    private labelX = 0;
    private rowY: number[] = [];
    private meterY = 0;
    private hud!: ReturnType<typeof mountControls>;

    override async load(loader): Promise<void> {
        this.music = await loader.load(AudioStream.of('audio/demo-loop-main.ogg'));
    }

    override init(): void {
        const { width, height } = this.app.canvas;

        // Wide horizontal bars centred on the 16:9 canvas; labels sit to the left.
        this.barW = width * 0.45;
        this.barX = width * 0.32;
        this.labelX = width * 0.1;
        this.rowY = sliders.map((_, i) => height * 0.26 + i * 90);
        this.meterY = this.rowY[this.rowY.length - 1] + 100;

        this.filter = new CompressorEffect();
        app.audio.music.addEffect(this.filter);

        this.gfx = new Graphics();
        this.labels = sliders.map(() => new Text('', { fillColor: Color.white, fontSize: 16 }));
        this.meterLabel = new Text('', { fillColor: Color.white, fontSize: 16 });
        this.meterLabel.setPosition(this.labelX, this.meterY - 6);

        // Shown while the browser still blocks audio (`app.audio.locked`); the
        // first click or keypress unlocks it and the queued music starts.
        this.tapPrompt = new Text('Click or press any key to start audio', { fillColor: Color.white, fontSize: 22, align: 'center' })
            .setAnchor(0.5, 0.5)
            .setPosition(width / 2, height - 48);

        this.hud = mountControls({
            title: 'Compressor',
            controls: [{ keys: 'Drag', action: 'sweep a parameter bar' }],
            status: 'Click or press any key to start…',
            hint: 'The red bar shows live gain reduction — louder peaks pull it further right.',
        });

        this.app.input.onPointerDown.add(p => {
            this.drag = this.sliderAt(p.y);
            this.apply(p.x);
        });
        this.app.input.onPointerMove.add(p => {
            this.apply(p.x);
        });
        this.app.input.onPointerUp.add(() => {
            this.drag = -1;
        });

        // Core defers playback until the AudioContext unlocks on the first
        // gesture, then starts automatically.
        this.app.audio.play(this.music, { loop: true, volume: 0.8 });
        this.hud.setStatus('Compressing music bus…');
    }

    private sliderAt(y: number): number {
        for (let i = 0; i < sliders.length; i++) if (Math.abs(y - this.rowY[i]) <= 16) return i;
        return -1;
    }

    private apply(x: number): void {
        if (this.drag < 0) return;
        const def = sliders[this.drag];
        const t = Math.max(0, Math.min(1, (x - this.barX) / this.barW));
        this.filter[def.key] = def.min + (def.max - def.min) * t;
    }

    private value(def: SliderDef): number {
        return this.filter[def.key];
    }

    override draw(context): void {
        context.backend.clear();
        this.gfx.clear();
        for (let i = 0; i < sliders.length; i++) {
            const def = sliders[i];
            const y = this.rowY[i];
            const val = this.value(def);
            const t = (val - def.min) / (def.max - def.min);
            this.gfx.fillColor = new Color(70, 70, 70);
            this.gfx.drawRectangle(this.barX, y - 6, this.barW, 12);
            this.gfx.fillColor = new Color(120, 200, 255);
            this.gfx.drawRectangle(this.barX, y - 6, this.barW * t, 12);
            this.labels[i].text = `${def.key}: ${val.toFixed(def.key === 'ratio' ? 2 : 3)}`;
            this.labels[i].setPosition(this.labelX, y - 12);
            context.render(this.labels[i]);
        }

        const reduction = this.filter.reduction;
        const meterT = Math.max(0, Math.min(1, -reduction / 24));
        this.gfx.fillColor = new Color(70, 70, 70);
        this.gfx.drawRectangle(this.barX, this.meterY, this.barW, 12);
        this.gfx.fillColor = new Color(255, 140, 140);
        this.gfx.drawRectangle(this.barX, this.meterY, this.barW * meterT, 12);
        this.meterLabel.text = `gain reduction: ${reduction.toFixed(1)} dB`;
        context.render(this.meterLabel);

        context.render(this.gfx);

        if (this.app.audio.locked) {
            context.render(this.tapPrompt);
        }
    }
}

app.start(new CompressorScene());
