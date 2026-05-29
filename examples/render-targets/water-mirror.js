import {
    Application,
    Color,
    RenderBackendType,
    RenderTargetPass,
    RenderTexture,
    Scene,
    Sprite,
    Texture,
    WebGl2ShaderFilter,
    WebGpuShaderFilter,
} from '@codexo/exojs';

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
precision mediump float; uniform sampler2D uTexture; uniform float uTime; in vec2 vUv; out vec4 fragColor;
void main(){ vec2 uv=vUv; uv.y += sin(uv.x*18.0+uTime*2.8)*0.025; vec4 c=texture(uTexture,uv); fragColor=vec4(c.rgb*vec3(0.72,0.85,1.0),c.a*0.85); }`;
const wgsl = `
@group(0) @binding(1) var uTexture:texture_2d<f32>;
@group(0) @binding(2) var uSampler:sampler;
struct Uniforms { uTime:f32, _pad0:vec3<f32> };
@group(1) @binding(0) var<uniform> uniforms:Uniforms;
@fragment fn main(@location(0) vUv:vec2<f32>)->@location(0) vec4<f32>{
    var uv=vUv; uv.y = uv.y + sin(uv.x*18.0+uniforms.uTime*2.8)*0.025;
    let c=textureSample(uTexture,uSampler,uv); return vec4<f32>(c.rgb*vec3<f32>(0.72,0.85,1.0),c.a*0.85);
}`;

app.start(
    new (class extends Scene {
        async load(loader) {
            await loader.load(Texture, { bunny: 'image/bunny.png' });
        }
        init(loader) {
            this._rt = new RenderTexture(800, 280);
            this._source = new Sprite(loader.get(Texture, 'bunny')).setAnchor(0.5).setPosition(400, 180).setScale(2);
            this._mirror = new Sprite(this._rt).setPosition(0, 320).setScale(1, -1);
            this._filter =
                app.backend.backendType === RenderBackendType.WebGpu
                    ? new WebGpuShaderFilter({ fragmentSource: wgsl, uniforms: { uTime: 0 } })
                    : new WebGl2ShaderFilter({ fragmentSource: glsl, uniforms: { uTime: 0 } });
            this._mirror.filters = [this._filter];
            this._time = 0;
        }
        update(delta) {
            this._time += delta.seconds;
            this._source.setPosition(400 + Math.cos(this._time * 1.7) * 170, 180 + Math.sin(this._time * 1.3) * 60);
            this._filter.uniforms.uTime = this._time;
        }
        draw(context) {
            context.backend.execute(
                new RenderTargetPass(
                    () => {
                        context.backend.clear();
                        context.render(this._source);
                    },
                    { target: this._rt, view: this._rt.view, clearColor: Color.transparentBlack }
                )
            );
            context.backend.clear(new Color(18, 24, 36));
            context.render(this._source);
            context.render(this._mirror);
        }
    })()
);
