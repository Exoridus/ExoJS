import { Application, Asset, Color, type RenderingContext, Scene, Text, Time, Timer } from '@codexo/exojs';



// The scene lifecycle has two hooks:
//   - `init(loader)`  — one-shot async setup, called once before the first frame.
//                        Fetch/await assets here (`this.loader.get(...)` for
//                        seamless resources, `await this.loader.load(...)` for
//                        value assets), then build the scene graph.
//   - `destroy()`     — one-shot teardown, called once when the scene is
//                        finally popped off the stack.
// `update`/`draw` run every frame in between. Two signals bracket
// activation from the outside: `onActivate` fires once the scene becomes
// visible (fresh activation or a retention restore) and `onSuspend` fires
// if the scene is ever retained instead of destroyed — a hook point for
// cross-cutting concerns (audio cues, analytics, HUD toggles) that shouldn't
// live inside `init`/`destroy` themselves.
class LifecycleScene extends Scene {
    private events!: string[];
    private counter = 0;
    private drawCount = 0;
    private timer!: Timer;
    private text!: Text;

    override async init(): Promise<void> {
        const app = this.app;
        if (app === null) throw new Error('Scene.app is unavailable before the scene is attached to an Application.');
        const { width, height } = app.canvas;

        // This scene is procedural — nothing to fetch — but a real scene would
        // resolve its assets here before touching the scene graph, e.g.:
        //   const texture = this.loader.get('ship.png');
        //   const data = (await this.loader.load(Asset.kind('json', 'level.json'))) as LevelData;
        this.events = ['init'];

        this.onActivate.add(() => {
            this.events.push('onActivate');
        });

        this.onSuspend.add(() => {
            this.events.push('onSuspend');
        });

        this.timer = new Timer(Time.fromSeconds(1), true);

        this.text = new Text('', { fillColor: Color.white, fontSize: 18 });
        this.text.setAnchor(0.5);
        this.text.setPosition(width / 2, height / 2);
    }

    override update(): void {
        if (this.timer.expired) {
            this.counter++;
            this.events.push(`update ${this.counter}`);
            this.timer.restart();
        }
    }

    override draw(context: RenderingContext): void {
        this.drawCount++;
        context.backend.clear();
        this.text.text = [...this.events.slice(-8), `draw ${this.drawCount}`].join('\n');
        context.render(this.text);
    }

    override destroy(): void {
        // destroy() is the single teardown hook — no separate unload() step.
        this.events.push('destroy');
        super.destroy();
    }
}

const app = new Application({
    scenes: { LifecycleScene },
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

app.start(LifecycleScene);
