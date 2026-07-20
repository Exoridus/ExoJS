import { Application, Color, Ease, Graphics, type RenderingContext, Scene, Text, type Time } from '@codexo/exojs';
import { mountControls } from '@examples/runtime';



// Every built-in Ease function, in source order.
const EASINGS: Array<[string, (t: number) => number]> = [
    ['linear', Ease.linear],
    ['quadIn', Ease.quadIn],
    ['quadOut', Ease.quadOut],
    ['quadInOut', Ease.quadInOut],
    ['cubicIn', Ease.cubicIn],
    ['cubicOut', Ease.cubicOut],
    ['cubicInOut', Ease.cubicInOut],
    ['quartIn', Ease.quartIn],
    ['quartOut', Ease.quartOut],
    ['quartInOut', Ease.quartInOut],
    ['quintIn', Ease.quintIn],
    ['quintOut', Ease.quintOut],
    ['quintInOut', Ease.quintInOut],
    ['sineIn', Ease.sineIn],
    ['sineOut', Ease.sineOut],
    ['sineInOut', Ease.sineInOut],
    ['expoIn', Ease.expoIn],
    ['expoOut', Ease.expoOut],
    ['expoInOut', Ease.expoInOut],
    ['circIn', Ease.circIn],
    ['circOut', Ease.circOut],
    ['circInOut', Ease.circInOut],
    ['backIn', Ease.backIn],
    ['backOut', Ease.backOut],
    ['backInOut', Ease.backInOut],
    ['bounceIn', Ease.bounceIn],
    ['bounceOut', Ease.bounceOut],
    ['bounceInOut', Ease.bounceInOut],
    ['elasticIn', Ease.elasticIn],
    ['elasticOut', Ease.elasticOut],
    ['elasticInOut', Ease.elasticInOut],
];

// 30 easings laid out 10 wide × 3 tall to spread across the wider 16:9 frame.
const COLS = 10;
const ROWS = 3;
const HEADER = 8;
const SAMPLES = 22;
// Value range plotted per cell (back/elastic overshoot beyond [0, 1]).
const V_MIN = -0.45;
const V_MAX = 1.45;

class EasingCurvesScene extends Scene {
    private graphics = new Graphics();
    private labels: Array<Text> = [];
    private t = 0;
    private direction = 1;
    private cellWidth = 0;
    private cellHeight = 0;

    override init(): void {
        const app = this.app;
        if (app === null) throw new Error('Scene.app is unavailable before the scene is attached to an Application.');
        const { width, height } = app.canvas;

        this.cellWidth = width / COLS;
        this.cellHeight = (height - HEADER) / ROWS;

        this.labels = EASINGS.map(([name], index) => {
            const { x, y } = this.cell(index);
            const label = new Text(name, { fillColor: new Color(200, 214, 240), fontSize: 11 });

            label.setPosition(x + 10, y + 4);

            return label;
        });

        mountControls({
            title: `Easing Curves — all ${EASINGS.length}`,
            hint: 'Each cell plots f(t) over 0→1; the dot traces the curve as t sweeps back and forth.',
        });
    }

    private cell(index: number): { x: number; y: number } {
        const col = index % COLS;
        const row = Math.floor(index / COLS);

        return { x: col * this.cellWidth, y: HEADER + row * this.cellHeight };
    }

    private plotY(value: number, plotTop: number, plotHeight: number): number {
        const norm = (value - V_MIN) / (V_MAX - V_MIN);

        return plotTop + plotHeight * (1 - Math.max(0, Math.min(1, norm)));
    }

    override update(delta: Time): void {
        this.t += this.direction * delta.seconds * 0.6;

        if (this.t >= 1) {
            this.t = 1;
            this.direction = -1;
        } else if (this.t <= 0) {
            this.t = 0;
            this.direction = 1;
        }
    }

    override draw(context: RenderingContext): void {
        context.backend.clear();

        const g = this.graphics;

        g.clear();

        const plotPadX = 10;
        const plotW = this.cellWidth - plotPadX * 2;
        const plotTop = 22;
        const plotH = this.cellHeight - plotTop - 8;

        // Plot backgrounds.
        g.fillColor = new Color(30, 35, 48);
        for (let i = 0; i < EASINGS.length; i++) {
            const { x, y } = this.cell(i);

            g.drawRectangle(x + plotPadX, y + plotTop, plotW, plotH);
        }

        // Curve sample dots.
        g.fillColor = new Color(96, 120, 160);
        for (let i = 0; i < EASINGS.length; i++) {
            const { x, y } = this.cell(i);
            const easing = EASINGS[i][1];

            for (let s = 0; s <= SAMPLES; s++) {
                const t = s / SAMPLES;

                g.drawCircle(x + plotPadX + t * plotW, this.plotY(easing(t), y + plotTop, plotH), 1.4);
            }
        }

        // Moving dot at the current t.
        g.fillColor = new Color(90, 210, 255);
        for (let i = 0; i < EASINGS.length; i++) {
            const { x, y } = this.cell(i);
            const easing = EASINGS[i][1];

            g.drawCircle(x + plotPadX + this.t * plotW, this.plotY(easing(this.t), y + plotTop, plotH), 3);
        }

        context.render(g);

        for (const label of this.labels) {
            context.render(label);
        }
    }
}

const app = new Application({
    scenes: { EasingCurvesScene },
    canvas: {
        width: 1280,
        height: 720,
        mount: document.body,
        sizingMode: 'fit',
    },
    clearColor: new Color(18, 21, 30),
});

app.start(EasingCurvesScene);
