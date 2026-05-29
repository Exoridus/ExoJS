import { Application, Color, RenderBackendType, Scene, Sprite, Texture, WebGl2ShaderFilter, WebGpuShaderFilter } from '@codexo/exojs';

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
void main(){ vec2 uv=vUv*2.0-1.0; uv*=1.0+dot(uv,uv)*0.07; uv=uv*0.5+0.5; vec4 c=texture(uTexture,uv); float scan=0.88+0.12*sin(vUv.y*900.0); float vig=1.0-smoothstep(0.45,0.95,length(vUv-0.5)); fragColor=vec4(c.rgb*scan*vig,c.a);} `;
const wgsl = `@group(0) @binding(1) var uTexture:texture_2d<f32>; @group(0) @binding(2) var uSampler:sampler;
@fragment fn main(@location(0) vUv:vec2<f32>)->@location(0) vec4<f32>{ var uv=vUv*2.0-vec2<f32>(1.0); uv=uv*(1.0+dot(uv,uv)*0.07); uv=uv*0.5+vec2<f32>(0.5); let c=textureSample(uTexture,uSampler,uv); let scan=0.88+0.12*sin(vUv.y*900.0); let vig=1.0-smoothstep(0.45,0.95,length(vUv-vec2<f32>(0.5))); return vec4<f32>(c.rgb*scan*vig,c.a);} `;

app.start(
    new (class extends Scene {
        async load(loader) {
            await loader.load(Texture, { bunny: 'image/bunny.png' });
        }
        init(loader) {
            const filter =
                app.backend.backendType === RenderBackendType.WebGpu
                    ? new WebGpuShaderFilter({ fragmentSource: wgsl })
                    : new WebGl2ShaderFilter({ fragmentSource: glsl });
            this._sprite = new Sprite(loader.get(Texture, 'bunny')).setAnchor(0.5).setScale(2).setPosition(400, 300);
            this._sprite.filters = [filter];
        }
        draw(context) {
            context.backend.clear();
            context.render(this._sprite);
        }
    })()
);
