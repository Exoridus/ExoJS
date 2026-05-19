import { Application, Color, Graphics, RenderBackendType, Scene, WebGl2ShaderFilter, WebGpuShaderFilter } from '@codexo/exojs';

const app = new Application({
    canvas: {
        width: 800,
        height: 600,
    },
    clearColor: Color.black,
    loader: {
        basePath: 'assets/',
    },
});

document.body.append(app.canvas);

const glsl = `#version 300 es
precision mediump float; uniform sampler2D uTexture; in vec2 vUv; out vec4 fragColor;
void main(){ float l=texture(uTexture,vUv).r; float m=smoothstep(0.2,0.35,l); fragColor=vec4(vec3(0.2,0.9,1.0)*m,m); }`;
const wgsl = `@group(0) @binding(1) var uTexture:texture_2d<f32>; @group(0) @binding(2) var uSampler:sampler;
@fragment fn main(@location(0) vUv:vec2<f32>)->@location(0) vec4<f32>{ let l=textureSample(uTexture,uSampler,vUv).r; let m=smoothstep(0.2,0.35,l); return vec4<f32>(vec3<f32>(0.2,0.9,1.0)*m,m);} `;

app.start(
    new (class extends Scene {
        init() {
            this._balls = new Graphics();
            this._points = Array.from({ length: 8 }, (_, i) => ({ a: (i / 8) * Math.PI * 2, r: 90 + (i % 3) * 35 }));
            this._filter =
                app.backend.backendType === RenderBackendType.WebGpu
                    ? new WebGpuShaderFilter({ fragmentSource: wgsl })
                    : new WebGl2ShaderFilter({ fragmentSource: glsl });
            this._balls.filters = [this._filter];
        }
        update(delta) {
            for (const point of this._points) point.a += delta.seconds * (0.8 + point.r / 200);
            this._balls.clear();
            this._balls.fillColor = Color.white;
            for (const point of this._points) {
                this._balls.drawCircle(400 + Math.cos(point.a) * point.r, 300 + Math.sin(point.a * 1.4) * point.r * 0.6, 36);
            }
        }
        draw(backend) {
            backend.clear();
            this._balls.render(backend);
        }
    })()
);
