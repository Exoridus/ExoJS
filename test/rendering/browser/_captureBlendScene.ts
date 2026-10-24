import { particlesExtension, ParticleSystem } from '@codexo/exojs/particles';
import { expect } from 'vitest';

import { Color } from '#core/Color';
import { materializeRendererBindings } from '#extensions/materialize';
import { Rectangle } from '#math/Rectangle';
import { Container } from '#rendering/Container';
import { SpriteMaterial } from '#rendering/material/SpriteMaterial';
import { Mesh } from '#rendering/mesh/Mesh';
import { RenderingContext } from '#rendering/RenderingContext';
import { Shader } from '#rendering/shader/Shader';
import { spriteVertexGlsl } from '#rendering/sprite/materialSources';
import { Sprite } from '#rendering/sprite/Sprite';
import { Text } from '#rendering/text/Text';
import { RenderTexture } from '#rendering/texture/RenderTexture';
import { Texture } from '#rendering/texture/Texture';
import { BlendModes } from '#rendering/types';
import type { WebGl2Backend } from '#rendering/webgl2/WebGl2Backend';
import type { WebGpuBackend } from '#rendering/webgpu/WebGpuBackend';

import { w3cBlend } from './_blendReference';

const linear = (value: number): number => {
  const encoded = value / 255;

  return encoded <= 0.04045 ? encoded / 12.92 : ((encoded + 0.055) / 1.055) ** 2.4;
};

const backdrop = [80, 160, 220].map(linear) as [number, number, number];
const foreground = [210, 70, 140].map(linear) as [number, number, number];

const expectedPixel = (mode: BlendModes, alpha: number, sourceAlpha = 0.7): number[] => {
  const blended = mode >= BlendModes.Multiply ? w3cBlend(mode, backdrop, foreground) : foreground;
  const expected = [0, 0, 0, mode === BlendModes.Subtract ? alpha : sourceAlpha + alpha * (1 - sourceAlpha)];

  for (let channel = 0; channel < 3; channel++) {
    const source = foreground[channel]! * sourceAlpha;
    const destination = backdrop[channel]! * alpha;

    expected[channel] =
      mode === BlendModes.Normal
        ? source + destination * (1 - sourceAlpha)
        : mode === BlendModes.Additive
          ? source + destination
          : mode === BlendModes.Subtract
            ? destination * (1 - source)
            : (1 - sourceAlpha) * destination + (1 - alpha) * source + sourceAlpha * alpha * blended[channel]!;
  }

  return expected.map(value => Math.round(Math.max(0, Math.min(1, value)) * 255));
};

export const verifyCaptureBlendPixels = async (backend: WebGl2Backend | WebGpuBackend, prime: boolean, kind: string): Promise<void> => {
  const context = new RenderingContext(backend);
  const target = new RenderTexture(64, 64);
  const destination = new Sprite(Texture.white).setPosition(4, 4);
  const material =
    kind === 'custom'
      ? new SpriteMaterial({
          blendMode: BlendModes.Additive,
          shader: new Shader({
            glsl: {
              vertex: spriteVertexGlsl,
              fragment: `#version 300 es
precision mediump float;
in vec2 v_texcoord;
in vec4 v_color;
out vec4 fragColor;
void main() { fragColor = sampleBase(v_textureSlot, v_texcoord) * v_color; }`,
            },
            wgsl: `@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4<f32> {
  return sampleBase(input.textureSlot, input.texcoord) * input.color;
}`,
          }),
        })
      : null;
  const source =
    kind === 'mesh'
      ? new Mesh({ vertices: new Float32Array([4, 4, 28, 4, 28, 28, 4, 4, 28, 28, 4, 28]) })
      : kind === 'text'
        ? new Text('M', { fontSize: 32, fillColor: Color.white }).setPosition(4, 4)
        : kind === 'particles'
          ? new ParticleSystem(Texture.white, { capacity: 1, simulation: 'cpu' }).setPosition(16, 16)
          : new Sprite(Texture.white).setPosition(4, 4);
  const root = new Container();

  destination.width = destination.height = 24;

  if (source instanceof Sprite) {
    source.width = source.height = 24;
  }

  if (source instanceof Sprite) {
    source.material = material;
  }

  if (source instanceof ParticleSystem) {
    materializeRendererBindings(backend, particlesExtension.renderers!);
    const particle = source.emit()!;
    particle.position.set(5, 5);
    particle.color = new Color(210, 70, 140, 0.7).toRgba8();
  }

  let sample = source instanceof ParticleSystem ? new Rectangle(20, 20, 1, 1) : new Rectangle(12, 12, 1, 1);

  if (source instanceof Text) {
    context.renderTo(source, { target, clear: Color.transparent });
    backend.flush();
    const image = await context.readPixels(target);
    let found = false;

    for (let y = 4; y < 28 && !found; y++) {
      for (let x = 4; x < 28; x++) {
        if (image.data[(y * image.width + x) * 4 + 3]! >= 250) {
          sample = new Rectangle(x, y, 1, 1);
          found = true;
          break;
        }
      }
    }

    expect(found).toBe(true);
  }

  source.tint = new Color(210, 70, 140, 0.7);

  if (source instanceof Text) {
    source.style.fillColor = new Color(210, 70, 140);
  }

  root.addChild(destination, source);

  source.cacheAsTexture = kind === 'cached';

  if (kind === 'nested' || kind === 'opaque') {
    root.cacheAsTexture = kind === 'nested';
    target.opaqueDestination = kind === 'opaque';
    destination.setPosition(0, 0);
    destination.width = destination.height = 64;
  }

  try {
    if (prime) {
      const large = new Sprite(Texture.white);

      large.width = large.height = 48;
      large.tint = new Color(120, 40, 200, 0.6);
      large.blendMode = BlendModes.Luminosity;
      context.renderTo(large, { target, clear: Color.transparent });
      backend.flush();
      large.destroy();
    }

    const failures = [];

    for (const alpha of kind === 'opaque' ? [1] : [1, 0.45]) {
      for (let mode = BlendModes.Normal; mode <= BlendModes.Luminosity; mode++) {
        backend.resetStats();
        destination.tint = new Color(80, 160, 220, alpha);
        source.blendMode = mode;

        if (kind === 'nested') {
          root.invalidateCache();
        }

        context.renderTo(root, { target, clear: Color.transparent });
        backend.flush();

        if (kind === 'cached') {
          context.renderTo(root, { target, clear: Color.transparent });
          backend.flush();
        }

        const pixel = await context.readPixels(target, { region: sample });
        const expected = expectedPixel(
          mode === BlendModes.Normal && material !== null ? material.blendMode : mode,
          alpha,
          source instanceof Text ? 1 : 0.7,
        );
        const error = Math.max(...pixel.data.map((value, channel) => Math.abs(value - expected[channel]!)));

        if (error > 5) {
          failures.push({ mode, alpha, actual: [...pixel.data], expected, error });
        }

        expect(source.blendMode).toBe(mode);
      }
    }

    expect(failures).toEqual([]);
  } finally {
    root.destroy();
    target.destroy();
    material?.destroy();
  }
};
