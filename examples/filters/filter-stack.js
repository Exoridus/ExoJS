import { Application, BlurFilter, Color, ColorFilter, RenderBackendType, Scene, Sprite, Texture, WebGl2ShaderFilter, WebGpuShaderFilter } from '@codexo/exojs';

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
void main(){ vec4 c=texture(uTexture,vUv); fragColor=vec4(c.rgb*vec3(1.0,0.9,1.2),c.a);} `;
const wgsl = `@group(0) @binding(1) var uTexture:texture_2d<f32>; @group(0) @binding(2) var uSampler:sampler; @fragment fn main(@location(0) vUv:vec2<f32>)->@location(0) vec4<f32>{ let c=textureSample(uTexture,uSampler,vUv); return vec4<f32>(c.rgb*vec3<f32>(1.0,0.9,1.2),c.a);} `;

app.start(
    new (class extends Scene {
        async load(loader) {
            await loader.load(Texture, { bunny: 'image/bunny.png' });
        }
        init(loader) {
            this._sprite = new Sprite(loader.get(Texture, 'bunny')).setAnchor(0.5).setScale(2).setPosition(400, 300);
            const blur = new BlurFilter({ radius: 4, quality: 2 });
            const tint = new ColorFilter(new Color(140, 210, 255));
            const custom =
                app.backend.backendType === RenderBackendType.WebGpu
                    ? new WebGpuShaderFilter({ fragmentSource: wgsl })
                    : new WebGl2ShaderFilter({ fragmentSource: glsl });
            this._sprite.filters = [blur, tint, custom];
        }
        draw(backend) {
            backend.clear();
            this._sprite.render(backend);
        }
    })()
);
