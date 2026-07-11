import { Application, Color, Graphics, type RenderingContext, Scene, type Time, View } from '@codexo/exojs';
import { mountControls } from '@examples/runtime';

const app = new Application({
    canvas: {
        width: 1280,
        height: 720,
        mount: document.body,
        sizingMode: 'fit',
    },
    clearColor: new Color(10, 12, 20),
    loader: {
        basePath: 'assets/',
    },
});

// The camera continuously pans (a slow figure-eight) and breathes its zoom, so
// the same design-space pixel maps to a moving world point every frame.
// `screenToWorld(x, y)` undoes the camera transform — pointer coordinates are
// already in design space (`0..app.width`) — so we never hand-roll the inverse
// projection. Tap to drop a marker in *world* space; it stays pinned to the
// world as the camera moves over it.
class PointerToWorldScene extends Scene {
    private view!: View;
    private grid!: Graphics;
    private markers!: Graphics;
    private cursor = { x: 0, y: 0 };
    private world = { x: 0, y: 0 };
    private markerWorld: Array<{ x: number; y: number }> = [];
    private elapsed = 0;
    private userZoom = 1;
    private hud!: ReturnType<typeof mountControls>;

    override init(): void {
        const app = this.app;
        if (app === null) throw new Error('Scene.app is unavailable before the scene is attached to an Application.');
        const width = app.width;
        const height = app.height;

        this.view = new View(width / 2, height / 2, width, height);
        this.grid = new Graphics();
        this.markers = new Graphics();
        this.cursor = { x: width / 2, y: height / 2 };

        // Static world-space grid so the camera motion is visible against it.
        // Extends well beyond the viewport so the panning camera never runs off it.
        this.grid.lineWidth = 1;
        this.grid.lineColor = new Color(60, 66, 82);

        for (let x = -640; x <= width + 640; x += 80) {
            this.grid.drawLine(x, -480, x, height + 480);
        }

        for (let y = -480; y <= height + 480; y += 80) {
            this.grid.drawLine(-640, y, width + 640, y);
        }

        app.input.onPointerMove.add(pointer => {
            this.cursor.x = pointer.x;
            this.cursor.y = pointer.y;
        });

        app.input.onPointerTap.add(pointer => {
            const world = this.view.screenToWorld(pointer.x, pointer.y);

            this.markerWorld.push({ x: world.x, y: world.y });
        });

        // Scroll to nudge a user-controlled zoom that the automatic breath multiplies.
        app.input.onMouseWheel.add(offset => {
            this.userZoom = Math.max(0.4, Math.min(3, this.userZoom + (offset.y < 0 ? 0.1 : -0.1)));
        });

        this.hud = mountControls({
            title: 'Pointer to World',
            controls: [
                { keys: 'Move', action: 'read world coordinate' },
                { keys: 'Click', action: 'drop a world-pinned marker' },
                { keys: 'Wheel', action: 'zoom' },
            ],
            status: '',
            hint: 'The camera pans and zooms on its own — markers stay fixed in the world.',
        });
    }

    override update(delta: Time): void {
        const app = this.app;
        if (app === null) throw new Error('Scene.app is unavailable before the scene is attached to an Application.');
        const width = app.width;
        const height = app.height;

        this.elapsed += delta.seconds;

        // Slow figure-eight pan plus a gentle zoom breath.
        const centerX = width / 2 + Math.sin(this.elapsed * 0.5) * 220;
        const centerY = height / 2 + Math.sin(this.elapsed * 1.0) * 140;

        this.view.setCenter(centerX, centerY);
        this.view.setZoom(this.userZoom * (1 + Math.sin(this.elapsed * 0.35) * 0.25));
        this.view.update(delta.milliseconds);

        // Live world coordinate under the cursor — recomputed every frame because
        // the mapping changes as the camera moves.
        this.world = this.view.screenToWorld(this.cursor.x, this.cursor.y);

        this.hud.setStatus(`Screen ${Math.round(this.cursor.x)}, ${Math.round(this.cursor.y)} → World ${this.world.x.toFixed(0)}, ${this.world.y.toFixed(0)} · zoom ${this.view.zoomLevel.toFixed(2)}`);
    }

    override draw(context: RenderingContext): void {
        context.backend.clear();
        context.backend.setView(this.view);

        context.render(this.grid);

        // Rebuild markers each frame in their fixed world positions.
        this.markers.clear();
        this.markers.fillColor = new Color(255, 160, 80);

        for (const marker of this.markerWorld) {
            this.markers.drawCircle(marker.x, marker.y, 7);
        }

        // Highlight the live cursor→world point.
        this.markers.fillColor = new Color(120, 230, 255);
        this.markers.drawCircle(this.world.x, this.world.y, 5);

        context.render(this.markers);
        context.backend.setView(null);
    }
}

app.start(new PointerToWorldScene());
