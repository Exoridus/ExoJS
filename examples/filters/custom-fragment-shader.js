// Auto-generated from custom-fragment-shader.ts - edit the .ts source, not this file.
import { Application, Color, createFilterShaderSource, FixedResolutionCanvasSizing, Scene, ShaderFilter, Sprite, UniformType } from '@codexo/exojs';
import { mountControls } from '@examples/runtime';
const HUE_RAMP = assets.technical.color.hueRamp;
// Neither source declares the uniform: the schema below generates the GLSL
// block and the WGSL struct from one layout, and both bodies read it through
// the same `uniforms` instance.
const glsl = `#version 300 es
precision mediump float;
uniform sampler2D uTexture;
in vec2 vUv;
out vec4 fragColor;
void main(){ vec2 uv=vUv; uv.y += sin((uv.x*12.0)+uniforms.uTime*3.0)*0.03; fragColor=texture(uTexture,uv); }`;
const wgsl = `
@group(0) @binding(1) var uTexture:texture_2d<f32>;
@group(0) @binding(2) var uSampler:sampler;
@fragment fn fragmentMain(@location(0) vUv:vec2<f32>)->@location(0) vec4<f32>{
    var uv=vUv;
    uv.y = uv.y + sin((uv.x*12.0)+uniforms.uTime*3.0)*0.03;
    return textureSample(uTexture,uSampler,uv);
}`;
const warpShader = createFilterShaderSource({ glsl: { fragment: glsl }, wgsl, uniforms: { uTime: UniformType.Float } });
class CustomFragmentShaderScene extends Scene {
  time = 0;
  filter;
  sprite;
  hud;
  init() {
    const app = this.app;
    const { width, height } = app;
    this.filter = ShaderFilter.from(warpShader);
    this.sprite = new Sprite(this.loader.get(HUE_RAMP))
      .setAnchor(0.5)
      .setScale(4)
      .setPosition(width / 2, height / 2);
    this.sprite.filters = [this.filter];
    this.hud = mountControls({
      title: 'Custom Fragment Shader',
      status: 'A time-driven sine warp drives the sprite UVs each frame.',
      hint: 'One shader source declares `uTime` once; both languages get a matching uniform block generated for them.',
    });
  }
  update(delta) {
    this.time += delta;
    this.filter.uniforms.uTime.set(this.time);
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
await app.start(CustomFragmentShaderScene);
