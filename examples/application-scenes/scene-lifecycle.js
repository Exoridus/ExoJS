// Auto-generated from scene-lifecycle.ts — edit the .ts source, not this file.
import { Application, Color, Scene, Text, Time, Timer } from '@codexo/exojs';
// The scene lifecycle hooks, in the order the engine calls them:
//   - `async load()`   — one-shot async setup, called once before `init()`.
//                        Fetch/await assets here (`await this.loader.load(...)`),
//                        then build the scene graph in `init()`.
//   - `init()`         — one-shot sync setup, called once `load()` resolves.
//                        Must be synchronous — async work belongs in `load()`.
//   - `destroy()`      — one-shot teardown, called once when the scene ends
//                        permanently.
// `fixedUpdate`/`update`/`draw` run every frame in between.
// Two signals bracket the same span from the outside: `onActivate` fires
// every time the scene transitions into `Active` (fresh activation, a
// consumed preload, or a restore from retention) and `onSuspend` fires when
// the scene is suspended for retention (not on permanent teardown) — a hook
// point for cross-cutting concerns (audio cues, analytics, HUD toggles) that
// shouldn't live inside `init`/`destroy` themselves.
class LifecycleScene extends Scene {
    events;
    counter = 0;
    drawCount = 0;
    timer;
    text;
    async load() {
        // This scene is procedural — nothing to fetch — but a real scene would
        // resolve its assets here before touching the scene graph, e.g.:
        //   const data = (await this.loader.load(Asset.type('json', 'level.json'))) as LevelData;
        this.events = ['load'];
    }
    init() {
        const app = this.app;
        if (app === null)
            throw new Error('Scene.app is unavailable before the scene is attached to an Application.');
        const { width, height } = app.canvas;
        this.events.push('init');
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
        // destroy() is the final teardown hook — no separate unload() step
        // needed here since this scene holds no scene-private assets.
        this.events.push('destroy');
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
