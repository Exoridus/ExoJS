import { Application, Color, Graphics, type RenderingContext, Scene } from '@codexo/exojs';



const speeds = [0.15, 0.35, 0.6];
const counts = [120, 80, 48];
const colors = [new Color(120, 140, 200), new Color(170, 190, 255), new Color(255, 255, 255)];

class ParallaxStarfieldScene extends Scene {
    private layers!: Graphics[];
    private pointer = { x: 0, y: 0 };

    override init(): void {
        const app = this.app;
        if (app === null) throw new Error('Scene.app is unavailable before the scene is attached to an Application.');
        const { width, height } = app.canvas;
        const margin = 80;

        this.pointer = { x: width / 2, y: height / 2 };

        this.layers = counts.map((count, index) => {
            const g = new Graphics();
            g.fillColor = colors[index];
            for (let i = 0; i < count; i++) {
                const x = Math.random() * (width + margin * 2) - margin;
                const y = Math.random() * (height + margin * 2) - margin;
                const r = 1 + index;
                g.drawCircle(x, y, r);
            }
            return g;
        });

        app.input.onPointerMove.add(pointer => {
            this.pointer = { x: pointer.x, y: pointer.y };
        });
    }

    override draw(context: RenderingContext): void {
        const app = this.app;
        if (app === null) throw new Error('Scene.app is unavailable before the scene is attached to an Application.');
        const { width, height } = app.canvas;
        context.backend.clear();
        for (let i = 0; i < this.layers.length; i++) {
            const layer = this.layers[i];
            const factor = speeds[i];
            layer.setPosition((width / 2 - this.pointer.x) * factor, (height / 2 - this.pointer.y) * factor);
            context.render(layer);
        }
    }
}

const app = new Application({
    scenes: { ParallaxStarfieldScene },
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

app.start(ParallaxStarfieldScene);
