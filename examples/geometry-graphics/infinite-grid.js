// Auto-generated from infinite-grid.ts — edit the .ts source, not this file.
import { Application, Color, Keyboard, RenderBackendType, Scene, Sprite, View, WebGl2ShaderFilter, WebGpuShaderFilter } from '@codexo/exojs';
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
const glsl = `#version 300 es
precision mediump float;
uniform vec2 uCenter;
uniform vec2 uViewSize;
uniform sampler2D uTexture;
in vec2 vUv;
out vec4 fragColor;
float gridLine(vec2 p, float s, float w) {
    vec2 g = abs(fract(p / s - 0.5) - 0.5) / fwidth(p / s);
    float m = min(g.x, g.y);
    return 1.0 - smoothstep(w, w + 1.0, m);
}
void main() {
    vec2 world = (vUv - 0.5) * uViewSize + uCenter;
    float fine = gridLine(world, 40.0, 0.8) * 0.35;
    float bold = gridLine(world, 200.0, 1.1) * 0.7;
    vec3 base = vec3(0.06, 0.07, 0.09);
    vec3 col = base + vec3(0.22, 0.50, 0.70) * max(fine, bold);
    if (abs(world.x) < 1.0) col = vec3(0.95, 0.42, 0.42);
    if (abs(world.y) < 1.0) col = vec3(0.42, 0.95, 0.42);
    fragColor = vec4(col, 1.0);
}`;
const wgsl = `
@group(0) @binding(1) var uTexture: texture_2d<f32>;
@group(0) @binding(2) var uSampler: sampler;
struct Uniforms { uCenter: vec2<f32>, uViewSize: vec2<f32> };
@group(1) @binding(0) var<uniform> uniforms: Uniforms;
fn gridLine(p: vec2<f32>, s: f32, w: f32) -> f32 {
    let c = abs(fract(p / s - vec2<f32>(0.5)) - vec2<f32>(0.5));
    let m = min(c.x, c.y) * 120.0;
    return 1.0 - smoothstep(w, w + 1.0, m);
}
@fragment fn main(@location(0) vUv: vec2<f32>) -> @location(0) vec4<f32> {
    let world = (vUv - vec2<f32>(0.5)) * uniforms.uViewSize + uniforms.uCenter;
    let fine = gridLine(world, 40.0, 0.8) * 0.35;
    let bold = gridLine(world, 200.0, 1.1) * 0.7;
    var col = vec3<f32>(0.06, 0.07, 0.09) + vec3<f32>(0.22, 0.50, 0.70) * max(fine, bold);
    if (abs(world.x) < 1.0) { col = vec3<f32>(0.95, 0.42, 0.42); }
    if (abs(world.y) < 1.0) { col = vec3<f32>(0.42, 0.95, 0.42); }
    return vec4<f32>(col, 1.0);
}`;
class InfiniteGridScene extends Scene {
    view;
    move = { x: 0, y: 0, zoom: 0 };
    sprite;
    filter;
    init() {
        const app = this.app;
        if (app === null)
            throw new Error('Scene.app is unavailable before the scene is attached to an Application.');
        const { width, height } = app.canvas;
        this.view = new View(0, 0, width, height);
        this.sprite = new Sprite(this.loader.get('image/uv-grid-256.png'));
        this.sprite.width = width;
        this.sprite.height = height;
        this.filter =
            app.backend.backendType === RenderBackendType.WebGpu
                ? new WebGpuShaderFilter({ fragmentSource: wgsl, uniforms: { uCenter: [0, 0], uViewSize: [width, height] } })
                : new WebGl2ShaderFilter({ fragmentSource: glsl, uniforms: { uCenter: [0, 0], uViewSize: [width, height] } });
        this.sprite.filters = [this.filter];
        this.inputs.onActive(Keyboard.A, () => { this.move.x = -1; });
        this.inputs.onStop(Keyboard.A, () => { if (this.move.x < 0)
            this.move.x = 0; });
        this.inputs.onActive(Keyboard.D, () => { this.move.x = 1; });
        this.inputs.onStop(Keyboard.D, () => { if (this.move.x > 0)
            this.move.x = 0; });
        this.inputs.onActive(Keyboard.W, () => { this.move.y = -1; });
        this.inputs.onStop(Keyboard.W, () => { if (this.move.y < 0)
            this.move.y = 0; });
        this.inputs.onActive(Keyboard.S, () => { this.move.y = 1; });
        this.inputs.onStop(Keyboard.S, () => { if (this.move.y > 0)
            this.move.y = 0; });
        this.inputs.onActive(Keyboard.Q, () => { this.move.zoom = -1; });
        this.inputs.onStop(Keyboard.Q, () => { if (this.move.zoom < 0)
            this.move.zoom = 0; });
        this.inputs.onActive(Keyboard.E, () => { this.move.zoom = 1; });
        this.inputs.onStop(Keyboard.E, () => { if (this.move.zoom > 0)
            this.move.zoom = 0; });
    }
    update(delta) {
        this.view.move(this.move.x * 340 * delta.seconds, this.move.y * 340 * delta.seconds);
        this.view.setZoom(Math.max(0.2, this.view.zoomLevel + this.move.zoom * delta.seconds));
        this.filter.uniforms.uCenter = [this.view.center.x, this.view.center.y];
        this.filter.uniforms.uViewSize = [this.view.width, this.view.height];
    }
    draw(context) {
        context.backend.clear();
        context.render(this.sprite);
    }
}
app.start(new InfiniteGridScene());
