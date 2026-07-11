import { Application, BlurFilter, Color, Graphics, RenderBackendType, type RenderingContext, Scene, type Time, WebGl2ShaderFilter, WebGpuShaderFilter } from '@codexo/exojs';
import { mountControlPanel, mountControls } from '@examples/runtime';

const app = new Application({
    canvas: {
        width: 1280,
        height: 720,
        mount: document.body,
        sizingMode: 'fit',
    },
    clearColor: Color.black,
});

// Threshold pass: render solid cyan where the (blurred) red field is dense
// enough, with a smooth edge. The blur in front of this builds the scalar field
// from the hard circles, so neighbouring blobs merge where their fields sum.
const glsl = `#version 300 es
precision mediump float; uniform sampler2D uTexture; in vec2 vUv; out vec4 fragColor;
void main(){ float l=texture(uTexture,vUv).r; float m=smoothstep(0.28,0.5,l); fragColor=vec4(vec3(0.2,0.9,1.0)*m,m); }`;
const wgsl = `@group(0) @binding(1) var uTexture:texture_2d<f32>; @group(0) @binding(2) var uSampler:sampler;
@fragment fn main(@location(0) vUv:vec2<f32>)->@location(0) vec4<f32>{ let l=textureSample(uTexture,uSampler,vUv).r; let m=smoothstep(0.28,0.5,l); return vec4<f32>(vec3<f32>(0.2,0.9,1.0)*m,m);} `;

class MetaballsScene extends Scene {
    private balls!: Graphics;
    private points!: Array<{ a: number; r: number }>;
    private blur!: BlurFilter;
    private threshold!: WebGl2ShaderFilter | WebGpuShaderFilter;

    override init(): void {
        this.balls = new Graphics();
        this.points = Array.from({ length: 8 }, (_, i) => ({ a: (i / 8) * Math.PI * 2, r: 120 + (i % 3) * 56 }));

        this.blur = new BlurFilter({ radius: 12, quality: 3 });
        this.threshold =
            app.backend.backendType === RenderBackendType.WebGpu
                ? new WebGpuShaderFilter({ fragmentSource: wgsl })
                : new WebGl2ShaderFilter({ fragmentSource: glsl });

        // Order matters: blur first (build the field), threshold second.
        this.balls.filters = [this.blur, this.threshold];

        mountControls({
            title: 'Metaballs',
            hint: 'Hard circles are blurred into a scalar field, then thresholded — so nearby blobs merge.',
        });
        mountControlPanel({ title: 'Field' }).addSlider({
            label: 'Blur radius',
            min: 2,
            max: 24,
            step: 0.5,
            value: 12,
            onChange: value => {
                this.blur.radius = value;
            },
        });
    }

    override update(delta: Time): void {
        const app = this.app;
        if (app === null) throw new Error('Scene.app is unavailable before the scene is attached to an Application.');
        const { width, height } = app.canvas;

        for (const point of this.points) {
            point.a += delta.seconds * (0.4 + point.r / 600);
        }

        this.balls.clear();
        this.balls.fillColor = Color.white;

        // Spread the orbit wider than tall so the field fills the 16:9 frame.
        for (const point of this.points) {
            this.balls.drawCircle(width / 2 + Math.cos(point.a) * point.r * 1.6, height / 2 + Math.sin(point.a * 1.4) * point.r * 0.8, 44);
        }
    }

    override draw(context: RenderingContext): void {
        context.backend.clear();
        context.render(this.balls);
    }
}

app.start(new MetaballsScene());
