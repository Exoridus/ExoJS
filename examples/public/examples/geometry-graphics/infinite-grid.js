import { Application, Color, Keyboard, RenderBackendType, Scene, Sprite, Texture, View, WebGl2ShaderFilter, WebGpuShaderFilter } from '@codexo/exojs';

const app = new Application({
    width: 800,
    height: 600,
    clearColor: Color.black,
    resourcePath: 'assets/',
});

document.body.append(app.canvas);

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

app.start(
    new (class extends Scene {
        async load(loader) {
            await loader.load(Texture, { uv: 'image/uv.png' });
        }
        init(loader) {
            this._view = new View(0, 0, 800, 600);
            this._move = { x: 0, y: 0, zoom: 0 };
            this._sprite = new Sprite(loader.get(Texture, 'uv'));
            this._sprite.width = 800;
            this._sprite.height = 600;
            this._filter =
                app.backend.backendType === RenderBackendType.WebGpu
                    ? new WebGpuShaderFilter({ fragmentSource: wgsl, uniforms: { uCenter: [0, 0], uViewSize: [800, 600] } })
                    : new WebGl2ShaderFilter({ fragmentSource: glsl, uniforms: { uCenter: [0, 0], uViewSize: [800, 600] } });
            this._sprite.filters = [this._filter];
            this.inputs.onActive(Keyboard.A, () => {
                this._move.x = -1;
            });
            this.inputs.onStop(Keyboard.A, () => {
                if (this._move.x < 0) this._move.x = 0;
            });
            this.inputs.onActive(Keyboard.D, () => {
                this._move.x = 1;
            });
            this.inputs.onStop(Keyboard.D, () => {
                if (this._move.x > 0) this._move.x = 0;
            });
            this.inputs.onActive(Keyboard.W, () => {
                this._move.y = -1;
            });
            this.inputs.onStop(Keyboard.W, () => {
                if (this._move.y < 0) this._move.y = 0;
            });
            this.inputs.onActive(Keyboard.S, () => {
                this._move.y = 1;
            });
            this.inputs.onStop(Keyboard.S, () => {
                if (this._move.y > 0) this._move.y = 0;
            });
            this.inputs.onActive(Keyboard.Q, () => {
                this._move.zoom = -1;
            });
            this.inputs.onStop(Keyboard.Q, () => {
                if (this._move.zoom < 0) this._move.zoom = 0;
            });
            this.inputs.onActive(Keyboard.E, () => {
                this._move.zoom = 1;
            });
            this.inputs.onStop(Keyboard.E, () => {
                if (this._move.zoom > 0) this._move.zoom = 0;
            });
        }
        update(delta) {
            this._view.move(this._move.x * 340 * delta.seconds, this._move.y * 340 * delta.seconds);
            this._view.setZoom(Math.max(0.2, this._view.zoomLevel + this._move.zoom * delta.seconds));
            this._filter.uniforms.uCenter = [this._view.center.x, this._view.center.y];
            this._filter.uniforms.uViewSize = [this._view.width, this._view.height];
        }
        draw(backend) {
            backend.clear();
            this._sprite.render(backend);
        }
    })()
);
