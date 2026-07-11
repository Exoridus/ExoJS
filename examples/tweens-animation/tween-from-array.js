// Auto-generated from tween-from-array.ts — edit the .ts source, not this file.
import { Application, Color, Ease, Scene, Sprite } from '@codexo/exojs';
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
// A closed loop of waypoints expressed as fractions of the canvas so the path
// spreads across the wider 16:9 frame instead of staying in an 800×600 box.
const waypointFractions = [
    { fx: 0.1, fy: 0.55 },
    { fx: 0.22, fy: 0.28 },
    { fx: 0.42, fy: 0.2 },
    { fx: 0.62, fy: 0.32 },
    { fx: 0.9, fy: 0.55 },
    { fx: 0.72, fy: 0.78 },
    { fx: 0.5, fy: 0.85 },
    { fx: 0.25, fy: 0.72 },
];
class TweenFromArrayScene extends Scene {
    sprite;
    waypoints = [];
    init() {
        const app = this.app;
        if (app === null)
            throw new Error('Scene.app is unavailable before the scene is attached to an Application.');
        const { width, height } = app.canvas;
        this.waypoints = waypointFractions.map(({ fx, fy }) => ({ x: fx * width, y: fy * height }));
        this.sprite = new Sprite(this.loader.get('image/ship-a.png')).setAnchor(0.5).setPosition(this.waypoints[0].x, this.waypoints[0].y);
        this.buildPath();
    }
    buildPath() {
        const app = this.app;
        if (app === null)
            throw new Error('Scene.app is unavailable before the scene is attached to an Application.');
        let first = null;
        let prev = null;
        for (let i = 1; i < this.waypoints.length; i++) {
            const next = app.tweens.create(this.sprite.position).to(this.waypoints[i], 0.35).easing(Ease.sineInOut);
            if (first === null)
                first = next;
            if (prev !== null)
                prev.chain(next);
            prev = next;
        }
        prev.onComplete(() => {
            this.sprite.setPosition(this.waypoints[0].x, this.waypoints[0].y);
            this.buildPath();
        });
        first.start();
    }
    draw(context) {
        context.backend.clear();
        context.render(this.sprite);
    }
}
app.start(new TweenFromArrayScene());
