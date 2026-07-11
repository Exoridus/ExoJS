// Auto-generated from immediate-mode-rendering.ts — edit the .ts source, not this file.
import { Application, Color, Geometry, Matrix, RenderBatch, Scene } from '@codexo/exojs';
import { mountControlPanel, mountControls } from '@examples/runtime';
const app = new Application({
    canvas: {
        width: 1280,
        height: 720,
        mount: document.body,
        sizingMode: 'fit',
    },
    clearColor: new Color(6, 9, 18, 1),
});
// Number of instances drawn in the batched field. The whole field is one
// instanced draw call no matter how large this is.
const FIELD_COUNT = 2400;
// Procedural gears drawn individually with drawGeometry — one draw call each.
const GEAR_COUNT = 14;
// Build a flat-shaded regular polygon as interleaved geometry: position
// (f32 x2) + color (u8 x4, normalized) per vertex, triangle-list. This is the
// exact "standard mesh layout" the immediate path repacks — position, optional
// texcoord, optional color — so an untextured colored shape needs no material.
function polygonGeometry(radius, sides, fill, center) {
    const stride = 12; // 2 * f32 (8) + 4 * u8 (4)
    const buffer = new ArrayBuffer(sides * 3 * stride);
    const view = new DataView(buffer);
    let offset = 0;
    const writeVertex = (x, y, color) => {
        view.setFloat32(offset + 0, x, true);
        view.setFloat32(offset + 4, y, true);
        view.setUint8(offset + 8, color.r);
        view.setUint8(offset + 9, color.g);
        view.setUint8(offset + 10, color.b);
        view.setUint8(offset + 11, Math.round(color.a * 255));
        offset += stride;
    };
    for (let i = 0; i < sides; i++) {
        const a0 = (i / sides) * Math.PI * 2;
        const a1 = ((i + 1) / sides) * Math.PI * 2;
        // A triangle fan, emitted as a triangle list: center + two rim points.
        writeVertex(0, 0, center);
        writeVertex(Math.cos(a0) * radius, Math.sin(a0) * radius, fill);
        writeVertex(Math.cos(a1) * radius, Math.sin(a1) * radius, fill);
    }
    return new Geometry({
        attributes: [
            { name: 'a_position', size: 2, type: 'f32', normalized: false, offset: 0 },
            { name: 'a_color', size: 4, type: 'u8', normalized: true, offset: 8 },
        ],
        vertexData: buffer,
        stride,
        // 'static' is the default and is required by RenderBatch — its GPU
        // buffer is uploaded once and cached by identity across frames.
        usage: 'static',
    });
}
// Compose a raw world matrix (no node, no parent) from translation, rotation,
// and uniform scale. drawGeometry / RenderBatch take this verbatim as the
// instance's world transform — there is no origin/position/scale to compose.
function composeTransform(out, tx, ty, radians, scale) {
    const cos = Math.cos(radians) * scale;
    const sin = Math.sin(radians) * scale;
    // Row-major affine: world = (a*lx + b*ly + x, c*lx + d*ly + y).
    return out.set(cos, -sin, tx, sin, cos, ty);
}
class ImmediateModeScene extends Scene {
    // The single shared geometry every batched instance draws.
    sparkGeometry;
    // Reused across frames: clear() keeps the pooled per-instance storage, so a
    // steady-state batch allocates nothing.
    sparkBatch;
    sparks;
    gears;
    // One scratch matrix, rewritten per draw — immediate draws are flushed
    // synchronously, so a single matrix is safe to reuse.
    scratch = new Matrix();
    elapsed = 0;
    batched = true;
    hud;
    panel;
    init() {
        const app = this.app;
        if (app === null)
            throw new Error('Scene.app is unavailable before the scene is attached to an Application.');
        const { width, height } = app.canvas;
        const centerX = width / 2;
        const centerY = height / 2;
        // --- Procedural gears: each drawn with its own drawGeometry call. ---
        const gearPalette = [Color.gold, Color.skyBlue, Color.hotPink, Color.mediumSpringGreen, Color.orange, Color.mediumPurple];
        this.gears = [];
        for (let i = 0; i < GEAR_COUNT; i++) {
            const tint = gearPalette[i % gearPalette.length];
            const ringAngle = (i / GEAR_COUNT) * Math.PI * 2;
            const ringRadius = 250 + (i % 3) * 26;
            const sides = 5 + (i % 5);
            this.gears.push({
                geometry: polygonGeometry(40 + (i % 4) * 10, sides, new Color(tint.r, tint.g, tint.b, 1), Color.white),
                x: centerX + Math.cos(ringAngle) * ringRadius,
                y: centerY + Math.sin(ringAngle) * ringRadius,
                baseScale: 0.7 + (i % 3) * 0.18,
                spin: (i % 2 === 0 ? 1 : -1) * (0.4 + (i % 4) * 0.22),
                tint: new Color(tint.r, tint.g, tint.b, 1),
            });
        }
        // --- Instanced spark field: one small quad, FIELD_COUNT instances. ---
        this.sparkGeometry = polygonGeometry(7, 4, Color.white, Color.white);
        this.sparkBatch = new RenderBatch(this.sparkGeometry);
        const sparkPalette = [Color.skyBlue, Color.aquamarine, Color.gold, Color.hotPink, Color.white];
        this.sparks = [];
        for (let i = 0; i < FIELD_COUNT; i++) {
            const tint = sparkPalette[i % sparkPalette.length];
            this.sparks.push({
                angle: (i / FIELD_COUNT) * Math.PI * 2 * 8,
                radius: 30 + (i / FIELD_COUNT) * Math.min(width, height) * 0.46,
                speed: 0.15 + (i % 9) * 0.06,
                wobble: (i % 13) * 0.5,
                scale: 0.6 + (i % 5) * 0.18,
                tint: new Color(tint.r, tint.g, tint.b, 1),
            });
        }
        this.hud = mountControls({
            title: 'Immediate-Mode Rendering',
            controls: [
                { keys: ['Batched'], action: `${FIELD_COUNT} sparks via RenderBatch + drawBatch (1 draw call)` },
                { keys: ['Per-shape'], action: 'each gear via drawGeometry (1 draw call each)' },
            ],
            hint: 'Toggle the spark field between one instanced draw and one-draw-per-spark to compare draw calls.',
        });
        this.panel = mountControlPanel({ title: 'Render path' });
        this.panel.addToggle({
            label: 'Batch sparks',
            value: this.batched,
            onChange: value => {
                this.batched = value;
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
        const centerX = width / 2;
        const centerY = height / 2;
        const time = this.elapsed;
        context.backend.clear();
        // 1) Instanced field. Rebuild the per-instance transforms each frame,
        //    then submit the whole batch as ONE instanced draw call — or, when
        //    toggled off, draw each instance with its own drawGeometry to show
        //    the draw-call cost the batch collapses.
        this.sparkBatch.clear();
        for (const spark of this.sparks) {
            const angle = spark.angle + time * spark.speed;
            const radius = spark.radius + Math.sin(time * 1.3 + spark.wobble) * 14;
            const x = centerX + Math.cos(angle) * radius;
            const y = centerY + Math.sin(angle) * radius;
            const scale = spark.scale + Math.sin(time * 2 + spark.wobble) * 0.2;
            composeTransform(this.scratch, x, y, angle, scale);
            if (this.batched) {
                this.sparkBatch.add(this.scratch, spark.tint);
            }
            else {
                context.drawGeometry(this.sparkGeometry, this.scratch, { tint: spark.tint });
            }
        }
        if (this.batched) {
            context.drawBatch(this.sparkBatch);
        }
        // 2) Procedural gears on top — one immediate drawGeometry per gear, each
        //    with its own raw transform and tint, no scene node involved.
        for (const gear of this.gears) {
            const scale = gear.baseScale * (1 + Math.sin(time * 1.5 + gear.x * 0.01) * 0.06);
            composeTransform(this.scratch, gear.x, gear.y, time * gear.spin, scale);
            context.drawGeometry(gear.geometry, this.scratch, { tint: gear.tint });
        }
        // drawCalls is the proof: batched → gears + 1, per-shape → gears + sparks.
        const drawCalls = context.stats.drawCalls;
        const path = this.batched ? 'RenderBatch (instanced)' : 'drawGeometry per spark';
        this.hud.setStatus(`${path} · ${FIELD_COUNT} sparks · ${GEAR_COUNT} gears · drawCalls: ${drawCalls}`);
    }
    destroy() {
        this.dispose();
    }
    dispose() {
        this.hud?.dispose();
        this.panel?.dispose();
        this.sparkBatch?.destroy();
        this.sparkGeometry?.destroy();
        if (this.gears) {
            for (const gear of this.gears) {
                gear.geometry.destroy();
            }
        }
    }
}
app.start(new ImmediateModeScene());
