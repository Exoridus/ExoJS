import { Application, Color, Graphics, Scene, Sound, Text } from '@codexo/exojs';

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

type FalloffModel = 'linear' | 'inverse' | 'exponential';

interface FalloffSource {
    model: FalloffModel;
    x: number;
    y: number;
    color: Color;
}

const SOURCES: FalloffSource[] = [
    { model: 'linear', x: 180, y: 460, color: new Color(255, 140, 140) },
    { model: 'inverse', x: 400, y: 460, color: new Color(140, 200, 255) },
    { model: 'exponential', x: 620, y: 460, color: new Color(200, 255, 140) },
];

const REF_DISTANCE = 60;
const MAX_DISTANCE = 320;
const ROLLOFF = 1;

function attenuation(model: FalloffModel, d: number): number {
    if (d <= REF_DISTANCE) return 1;
    if (model === 'linear') {
        return Math.max(0, 1 - ROLLOFF * ((d - REF_DISTANCE) / (MAX_DISTANCE - REF_DISTANCE)));
    }
    if (model === 'inverse') {
        return REF_DISTANCE / (REF_DISTANCE + ROLLOFF * (d - REF_DISTANCE));
    }
    return Math.pow(d / REF_DISTANCE, -ROLLOFF);
}

class FalloffCurvesScene extends Scene {
    private listener!: { x: number; y: number };
    private sounds!: Sound[];
    private graphics!: Graphics;
    private labels!: Text[];
    private hint!: Text;

    override async load(loader): Promise<void> {
        await loader.load(Sound, { source: 'audio/impact-light.ogg' });
    }

    override init(loader): void {
        this.listener = { x: 400, y: 300 };
        app.audio.listener.target = this.listener;

        this.sounds = SOURCES.map(({ model, x, y }) => {
            const sound = new Sound(loader.get(Sound, 'source').audioBuffer, {
                distanceModel: model,
                refDistance: REF_DISTANCE,
                maxDistance: MAX_DISTANCE,
                rolloffFactor: ROLLOFF,
            });
            sound.position = { x, y };
            sound.setLoop(true).setVolume(0.5).play();
            return sound;
        });

        this.graphics = new Graphics();
        this.labels = SOURCES.map(({ model, x, y }) => {
            const label = new Text(model, { fillColor: Color.white, fontSize: 16 });
            label.setPosition(x - 40, y + 30);
            return label;
        });
        this.hint = new Text('Move pointer to relocate listener', { fillColor: Color.white, fontSize: 16 });
        this.hint.setPosition(20, 20);

        this.app.input.onPointerMove.add(pointer => {
            this.listener.x = pointer.x;
            this.listener.y = pointer.y;
        });
    }

    override draw(context): void {
        context.backend.clear();
        this.graphics.clear();

        // Falloff-curve plots in the upper canvas area.
        const plotY = 100;
        const plotH = 90;
        const plotW = 720;
        const plotX = 40;
        this.graphics.fillColor = new Color(40, 40, 50);
        this.graphics.drawRectangle(plotX, plotY, plotW, plotH);
        for (const { model, color } of SOURCES) {
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
        for (let i = 0; i < SOURCES.length; i++) {
            const { x, y, color, model } = SOURCES[i];
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
        context.render(this.hint);
        for (const label of this.labels) context.render(label);
    }
}

app.start(new FalloffCurvesScene());
