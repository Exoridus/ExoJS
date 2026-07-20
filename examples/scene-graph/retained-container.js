// Auto-generated from retained-container.ts — edit the .ts source, not this file.
import { Application, Color, Container, Rectangle, RetainedContainer, Scene, Sprite, Texture } from '@codexo/exojs';
import { mountControlPanel, mountControls } from '@examples/runtime';
// A decor field far larger than the viewport: thousands of sprites that are
// authored ONCE and never mutated again — the exact shape the retained tier is
// built for. Only the group as a whole ever moves (the "camera" pan below).
const FIELD_COLUMNS = 96;
const FIELD_ROWS = 60;
const TILE_SPACING = 34;
const FIELD_COUNT = FIELD_COLUMNS * FIELD_ROWS;
class RetainedContainerScene extends Scene {
    atlas;
    // Typed as the base Container so the same field code works whether the
    // active group is a RetainedContainer or a plain Container.
    field;
    retained = true;
    elapsed = 0;
    // Exponential moving average of the wall-clock frame time, so the readout
    // is legible instead of flickering frame to frame.
    smoothedFrameMs = 0;
    hud;
    panel;
    init() {
        this.atlas = createAtlasTexture();
        this.field = this.buildField(this.retained);
        this.hud = mountControls({
            title: 'Retained Container',
            controls: [
                { keys: ['Retained tier'], action: 'the whole static field replays as O(batches) — no per-child walk' },
                { keys: ['Plain container'], action: 'every child is walked and re-collected each frame' },
            ],
            hint: 'The field only ever moves as a whole. Toggle the tier and watch the frame-time readout.',
        });
        this.panel = mountControlPanel({ title: 'Render tier' });
        this.panel.addToggle({
            label: 'Retained tier',
            value: this.retained,
            onChange: value => {
                this.retained = value;
                // Rebuild the field into the other container type. Destroying the
                // OLD group is safe: it owns no child that outlives it, so the
                // whole subtree is torn down together (see the in-place-destroy
                // footgun in the guide).
                this.field.destroy();
                this.field = this.buildField(this.retained);
            },
        });
    }
    update(delta) {
        this.elapsed += delta.seconds;
    }
    draw(context) {
        const app = this.app;
        if (app === null)
            throw new Error('Scene.app is unavailable before the scene is attached to an Application.');
        const { width, height } = app.canvas;
        context.backend.clear();
        // Pan the whole field along a slow Lissajous path, like a camera drifting
        // over a static world. For a RetainedContainer this is ONE group-matrix
        // update per frame — the retained fragment is untouched, so no descendant
        // transform is recomputed and no child is re-collected. A plain Container
        // still walks all FIELD_COUNT children every frame to place them.
        const panX = width / 2 + Math.cos(this.elapsed * 0.35) * 140;
        const panY = height / 2 + Math.sin(this.elapsed * 0.5) * 90;
        this.field.setPosition(panX, panY);
        context.render(this.field);
        // frameTimeMs is wall-clock and both tiers draw the SAME pixels with the
        // same draw calls, so the gap you see is the CPU collect/walk cost the
        // retained tier removes. The gap widens with field size and on slower
        // machines; on a fast desktop with a few thousand sprites it can be small.
        this.smoothedFrameMs += (context.stats.frameTimeMs - this.smoothedFrameMs) * 0.1;
        const tier = this.retained ? 'RetainedContainer' : 'plain Container';
        this.hud.setStatus(`${tier} · ${FIELD_COUNT} static sprites · submitted: ${context.stats.submittedNodes} · ` +
            `drawCalls: ${context.stats.drawCalls} · frame: ${this.smoothedFrameMs.toFixed(2)} ms`);
    }
    /**
     * Build the decor field into a fresh container of the requested tier.
     * Both branches produce an identical scene; only the container type differs,
     * which is the whole point of the comparison.
     */
    buildField(retained) {
        // The ONLY line that opts into the retained tier. There is no runtime
        // toggle on the instance itself — the tier is chosen at construction.
        const group = retained ? new RetainedContainer() : new Container();
        const frames = [new Rectangle(0, 0, 64, 64), new Rectangle(64, 0, 64, 64), new Rectangle(0, 64, 64, 64), new Rectangle(64, 64, 64, 64)];
        const palette = [Color.white, Color.skyBlue, Color.gold, Color.mediumSpringGreen, Color.hotPink, Color.mediumPurple];
        let index = 0;
        for (let row = 0; row < FIELD_ROWS; row++) {
            for (let column = 0; column < FIELD_COLUMNS; column++) {
                const sprite = new Sprite(this.atlas);
                // Deterministic layout, centered on the group origin so panning the
                // group reveals the field drifting as one rigid sheet.
                sprite.setTextureFrame(frames[index % frames.length]);
                sprite.setAnchor(0.5);
                sprite.setPosition((column - (FIELD_COLUMNS - 1) / 2) * TILE_SPACING, (row - (FIELD_ROWS - 1) / 2) * TILE_SPACING);
                sprite.setScale(0.42);
                sprite.setTint(palette[index % palette.length]);
                // Authored once, never mutated again: no per-frame setter runs on a
                // child, so the retained fragment stays clean and is spliced whole.
                group.addChild(sprite);
                index++;
            }
        }
        return group;
    }
    destroy() {
        this.hud?.dispose();
        this.panel?.dispose();
        this.field?.destroy();
        this.atlas?.destroy();
    }
}
const app = new Application({
    scenes: { RetainedContainerScene },
    canvas: {
        width: 1280,
        height: 720,
        mount: document.body,
        sizingMode: 'fit',
    },
    clearColor: new Color(6, 9, 18, 1),
});
app.start(RetainedContainerScene);
/** Draw a small 2x2 sprite atlas procedurally so the example needs no asset load. */
function createAtlasTexture() {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.width = 128;
    canvas.height = 128;
    drawAtlasCell(context, 0, 0, '#0f172a', '#ffd166', 'circle');
    drawAtlasCell(context, 64, 0, '#10243d', '#7dd3fc', 'diamond');
    drawAtlasCell(context, 0, 64, '#112b21', '#4ade80', 'square');
    drawAtlasCell(context, 64, 64, '#23163c', '#ff6b6b', 'triangle');
    return new Texture(canvas);
}
function drawAtlasCell(context, x, y, background, accent, shape) {
    context.fillStyle = background;
    context.fillRect(x, y, 64, 64);
    context.fillStyle = accent;
    context.beginPath();
    if (shape === 'circle') {
        context.arc(x + 32, y + 32, 18, 0, Math.PI * 2);
    }
    else if (shape === 'diamond') {
        context.moveTo(x + 32, y + 12);
        context.lineTo(x + 52, y + 32);
        context.lineTo(x + 32, y + 52);
        context.lineTo(x + 12, y + 32);
        context.closePath();
    }
    else if (shape === 'square') {
        context.rect(x + 16, y + 16, 32, 32);
    }
    else {
        context.moveTo(x + 32, y + 12);
        context.lineTo(x + 52, y + 52);
        context.lineTo(x + 12, y + 52);
        context.closePath();
    }
    context.fill();
}
