import {
    Application,
    CallbackRenderPass,
    Color,
    RenderBackendType,
    RenderNodePass,
    RenderPipeline,
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

class WaterMirrorScene extends Scene {
    private rt!: RenderTexture;
    private source!: Sprite;
    private mirror!: Sprite;
    private filter!: WebGl2ShaderFilter | WebGpuShaderFilter;
    private pipeline!: RenderPipeline;
    private time = 0;

    override async load(loader): Promise<void> {
        await loader.load(Texture, { bunny: 'image/ship-a.png' });
    }

    override init(loader): void {
        this.rt = new RenderTexture(800, 280);
        this.source = new Sprite(loader.get(Texture, 'bunny')).setAnchor(0.5).setPosition(400, 180).setScale(2);
        this.mirror = new Sprite(this.rt).setPosition(0, 320).setScale(1, -1);
        this.filter =
            app.backend.backendType === RenderBackendType.WebGpu
                ? new WebGpuShaderFilter({ fragmentSource: wgsl, uniforms: { uTime: 0 } })
                : new WebGl2ShaderFilter({ fragmentSource: glsl, uniforms: { uTime: 0 } });
        this.mirror.filters = [this.filter];

        // Capture the source into a target (camera view → a callback), then composite the source and
        // its filtered, flipped mirror to the screen.
        this.pipeline = new RenderPipeline()
            .addPass(
                new CallbackRenderPass(
                    (context) => {
                        context.backend.clear();
                        context.render(this.source);
                    },
                    { target: this.rt },
                ),
            )
            .addPass(new RenderNodePass(this.source, { clear: new Color(18, 24, 36) }))
            .addPass(new RenderNodePass(this.mirror));
    }

    override update(delta): void {
        this.time += delta.seconds;
        this.source.setPosition(400 + Math.cos(this.time * 1.7) * 170, 180 + Math.sin(this.time * 1.3) * 60);
        this.filter.uniforms.uTime = this.time;
    }

    override draw(context): void {
        this.pipeline.execute(context);
    }

    override destroy(): void {
        // Pipeline cascades destroy() to its passes; the caller-owned target and shader filter are freed here.
        this.pipeline.destroy();
        this.rt.destroy();
        this.filter.destroy();
        super.destroy();
    }
}

app.start(new WaterMirrorScene());
