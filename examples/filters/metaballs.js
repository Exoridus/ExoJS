// Auto-generated from metaballs.ts - edit the .ts source, not this file.
import { Application, BlurFilter, Color, FixedResolutionCanvasSizing, Graphics, Scene, ShaderFilter } from '@codexo/exojs';
import { mountControlPanel, mountControls } from '@examples/runtime';
// Threshold pass: render solid cyan where the (blurred) red field is dense
// enough, with a smooth edge. The blur in front of this builds the scalar field
// from the hard circles, so neighbouring blobs merge where their fields sum.
const glsl = `#version 300 es
precision mediump float; uniform sampler2D uTexture; in vec2 vUv; out vec4 fragColor;
void main(){ float l=texture(uTexture,vUv).r; float m=smoothstep(0.28,0.5,l); fragColor=vec4(vec3(0.2,0.9,1.0)*m,m); }`;
const wgsl = `@group(0) @binding(1) var uTexture:texture_2d<f32>; @group(0) @binding(2) var uSampler:sampler;
@fragment fn fragmentMain(@location(0) vUv:vec2<f32>)->@location(0) vec4<f32>{ let l=textureSample(uTexture,uSampler,vUv).r; let m=smoothstep(0.28,0.5,l); return vec4<f32>(vec3<f32>(0.2,0.9,1.0)*m,m);} `;
class MetaballsScene extends Scene {
  balls;
  points;
  blur;
  threshold;
  init() {
    this.balls = new Graphics();
    this.points = Array.from({ length: 8 }, (_, i) => ({ a: (i / 8) * Math.PI * 2, r: 120 + (i % 3) * 56 }));
    this.blur = new BlurFilter({ radius: 12, quality: 3 });
    this.threshold = new ShaderFilter({ glsl: { fragment: glsl }, wgsl });
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
  update(delta) {
    const app = this.app;
    const { width, height } = app;
    for (const point of this.points) {
      point.a += delta * (0.4 + point.r / 600);
    }
    this.balls.clear();
    this.balls.fillColor = Color.white;
    // Spread the orbit wider than tall so the field fills the 16:9 frame.
    for (const point of this.points) {
      this.balls.drawCircle(width / 2 + Math.cos(point.a) * point.r * 1.6, height / 2 + Math.sin(point.a * 1.4) * point.r * 0.8, 44);
    }
  }
  draw(context) {
    context.render(this.balls);
  }
}
const app = new Application({
  scenes: { MetaballsScene },
  canvas: {
    width: 1280,
    height: 720,
    mount: document.body,
    sizing: new FixedResolutionCanvasSizing(),
  },
  clearColor: Color.black,
});
await app.start(MetaballsScene);
