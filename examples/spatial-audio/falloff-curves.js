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

const SOURCES = [
    { model: 'linear', x: 180, y: 460, color: new Color(255, 140, 140) },
    { model: 'inverse', x: 400, y: 460, color: new Color(140, 200, 255) },
    { model: 'exponential', x: 620, y: 460, color: new Color(200, 255, 140) },
];

const REF_DISTANCE = 60;
const MAX_DISTANCE = 320;
const ROLLOFF = 1;

function attenuation(model, d) {
    if (d <= REF_DISTANCE) return 1;
    if (model === 'linear') {
        return Math.max(0, 1 - ROLLOFF * ((d - REF_DISTANCE) / (MAX_DISTANCE - REF_DISTANCE)));
    }
    if (model === 'inverse') {
        return REF_DISTANCE / (REF_DISTANCE + ROLLOFF * (d - REF_DISTANCE));
    }
    return Math.pow(d / REF_DISTANCE, -ROLLOFF);
}

app.start(
    new (class extends Scene {
        async load(loader) {
            await loader.load(Sound, { source: 'audio/example.ogg' });
        }
        init(loader) {
            this._listener = { x: 400, y: 300 };
            app.audio.listener.target = this._listener;

            this._sounds = SOURCES.map(({ model, x, y }) => {
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

            this._graphics = new Graphics();
            this._labels = SOURCES.map(({ model, x, y }) => {
                const label = new Text(model, { fill: 'white', fontSize: 16 });
                label.setPosition(x - 40, y + 30);
                return label;
            });
            this._hint = new Text('Move pointer to relocate listener', { fill: 'white', fontSize: 16 });
            this._hint.setPosition(20, 20);

            this.app.input.onPointerMove.add(pointer => {
                this._listener.x = pointer.x;
                this._listener.y = pointer.y;
            });
        }
        draw(context) {
            context.backend.clear();
            this._graphics.clear();

            // Falloff-curve plots in the upper canvas area.
            const plotY = 100;
            const plotH = 90;
            const plotW = 720;
            const plotX = 40;
            this._graphics.fillColor = new Color(40, 40, 50);
            this._graphics.drawRect(plotX, plotY, plotW, plotH);
            for (const { model, color } of SOURCES) {
                this._graphics.fillColor = color;
                for (let i = 0; i < plotW; i += 2) {
                    const d = (i / plotW) * MAX_DISTANCE * 1.2;
                    const v = attenuation(model, d);
                    this._graphics.drawRect(plotX + i, plotY + plotH - v * plotH, 2, 2);
                }
            }

            // Listener marker.
            this._graphics.fillColor = new Color(120, 255, 160);
            this._graphics.drawCircle(this._listener.x, this._listener.y, 10);

            // Source markers + live attenuation readouts.
            for (let i = 0; i < SOURCES.length; i++) {
                const { x, y, color, model } = SOURCES[i];
                const dx = x - this._listener.x;
                const dy = y - this._listener.y;
                const d = Math.sqrt(dx * dx + dy * dy);
                const v = attenuation(model, d);

                this._graphics.fillColor = color;
                this._graphics.drawCircle(x, y, 18);
                this._graphics.fillColor = new Color(255, 255, 255, Math.floor(v * 255));
                this._graphics.drawCircle(x, y, 6);

                this._labels[i].text = `${model}\nvol ${v.toFixed(2)}`;
            }

            context.render(this._graphics);
            context.render(this._hint);
            for (const label of this._labels) context.render(label);
        }
    })()
);
