// Auto-generated from custom-fragment-shader.ts - edit the .ts source, not this file.
import { Application, Color, FixedResolutionCanvasSizing, Scene, ShaderFilter, Sprite } from '@codexo/exojs';
import { mountControls } from '@examples/runtime';
const HUE_RAMP = assets.technical.color.hueRamp;
const glsl = `#version 300 es
precision mediump float;
uniform sampler2D uTexture;
uniform float uTime;
in vec2 vUv;
out vec4 fragColor;
void main(){ vec2 uv=vUv; uv.y += sin((uv.x*12.0)+uTime*3.0)*0.03; fragColor=texture(uTexture,uv); }`;
const wgsl = `
@group(0) @binding(1) var uTexture:texture_2d<f32>;
@group(0) @binding(2) var uSampler:sampler;
struct Uniforms { uTime:f32, _pad0:vec3<f32> };
@group(1) @binding(0) var<uniform> uniforms:Uniforms;
@fragment fn fragmentMain(@location(0) vUv:vec2<f32>)->@location(0) vec4<f32>{
    var uv=vUv;
    uv.y = uv.y + sin((uv.x*12.0)+uniforms.uTime*3.0)*0.03;
    return textureSample(uTexture,uSampler,uv);
}`;
class CustomFragmentShaderScene extends Scene {
  time = 0;
  filter;
  sprite;
  hud;
  init() {
    const app = this.app;
    const { width, height } = app;
    this.filter = new ShaderFilter({ glsl: { fragment: glsl }, wgsl, uniforms: { uTime: 0 } });
    this.sprite = new Sprite(this.loader.get(HUE_RAMP))
      .setAnchor(0.5)
      .setScale(4)
      .setPosition(width / 2, height / 2);
    this.sprite.filters = [this.filter];
    this.hud = mountControls({
      title: 'Custom Fragment Shader',
      status: 'A time-driven sine warp drives the sprite UVs each frame.',
      hint: 'One ShaderFilter carries both the GLSL and the WGSL source; uTime updates per frame.',
    });
  }
  update(delta) {
    this.time += delta;
    this.filter.setUniform('uTime', this.time);
  }
  draw(context) {
    context.render(this.sprite);
  }
}
const app = new Application({
  scenes: { CustomFragmentShaderScene },
  canvas: {
    width: 1280,
    height: 720,
    mount: document.body,
    sizing: new FixedResolutionCanvasSizing(),
  },
  clearColor: Color.black,
});
app.start(CustomFragmentShaderScene);
