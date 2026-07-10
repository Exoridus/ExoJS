// Auto-generated from scene-lifecycle.ts — edit the .ts source, not this file.
import { Application, Color, Scene, Text, Time, Timer } from '@codexo/exojs';
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
// The scene lifecycle has two hooks:
//   - `init(loader)`  — one-shot async setup, called once before the first frame.
//                        Fetch/await assets here (`this.loader.get(...)` for
//                        seamless resources, `await this.loader.load(...)` for
//                        value assets), then build the scene graph.
//   - `destroy()`     — one-shot teardown, called once when the scene is
//                        finally popped off the stack.
// `update`/`draw` run every frame in between. Two signals bracket the same
// span from the outside: `onLoad` fires right after `init()` resolves (the
// scene is about to become active) and `onUnload` fires right before
// `destroy()` runs (the scene is about to deactivate) — a hook point for
// cross-cutting concerns (audio cues, analytics, HUD toggles) that shouldn't
// live inside `init`/`destroy` themselves.
class LifecycleScene extends Scene {
    events;
    counter = 0;
    drawCount = 0;
    timer;
    text;
    async init() {
        const { width, height } = this.app.canvas;
        // This scene is procedural — nothing to fetch — but a real scene would
        // resolve its assets here before touching the scene graph, e.g.:
        //   const texture = this.loader.get('ship.png');
        //   const data = (await this.loader.load(Asset.kind('json', 'level.json'))) as LevelData;
        this.events = ['init'];
        this.onLoad.add(() => {
            this.events.push('onLoad');
        });
        this.onUnload.add(() => {
            this.events.push('onUnload');
        });
        this.timer = new Timer(Time.fromSeconds(1), true);
        this.text = new Text('', { fillColor: Color.white, fontSize: 18 });
        this.text.setAnchor(0.5);
        this.text.setPosition(width / 2, height / 2);
    }
    update() {
        if (this.timer.expired) {
            this.counter++;
            this.events.push(`update ${this.counter}`);
            this.timer.restart();
        }
    }
    draw(context) {
        this.drawCount++;
        context.backend.clear();
        this.text.text = [...this.events.slice(-8), `draw ${this.drawCount}`].join('\n');
        context.render(this.text);
    }
    destroy() {
        // destroy() is the single teardown hook — no separate unload() step.
        this.events.push('destroy');
        super.destroy();
    }
}
app.start(new LifecycleScene());
