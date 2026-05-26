import type { Color } from '@/core/Color';
import { clamp } from '@/math/utils';
import { Mesh } from '@/rendering/mesh/Mesh';
import { MeshShader, type MeshShaderUniformValue } from '@/rendering/mesh/MeshShader';

const maxGradientStops = 8;

const gradientVertexSource = `#version 300 es
precision mediump float;
layout(location = 0) in vec2 a_position;
layout(location = 1) in vec2 a_texcoord;
layout(location = 2) in vec4 a_color;
uniform mat3 u_projection;
uniform mat3 u_translation;
out vec2 v_uv;
void main() {
  vec3 world = u_translation * vec3(a_position, 1.0);
  vec3 clip = u_projection * world;
  gl_Position = vec4(clip.xy, 0.0, 1.0);
  v_uv = a_texcoord;
}`;

const gradientFragmentSource = `#version 300 es
precision mediump float;
in vec2 v_uv;
uniform vec4 u_tint;
uniform float u_mode;
uniform vec2 u_linearStart;
uniform vec2 u_linearEnd;
uniform vec2 u_radialCenter;
uniform float u_radialRadius;
uniform float u_stopCount;
uniform float u_stopOffsets[8];
uniform vec4 u_stopColors[8];
out vec4 outColor;

float resolveGradientT() {
  if (u_mode < 0.5) {
    vec2 axis = u_linearEnd - u_linearStart;
    float lengthSquared = dot(axis, axis);
    if (lengthSquared <= 0.000001) {
      return 0.0;
    }
    return dot(v_uv - u_linearStart, axis) / lengthSquared;
  }

  if (u_radialRadius <= 0.000001) {
    return 1.0;
  }

  return distance(v_uv, u_radialCenter) / u_radialRadius;
}

vec4 sampleGradient(float t) {
  float clamped = clamp(t, 0.0, 1.0);
  int count = int(u_stopCount);
  float previousOffset = u_stopOffsets[0];
  vec4 previousColor = u_stopColors[0];

  for (int i = 1; i < 8; i++) {
    if (i >= count) {
      break;
    }

    float currentOffset = u_stopOffsets[i];
    vec4 currentColor = u_stopColors[i];

    if (clamped <= currentOffset) {
      float span = max(currentOffset - previousOffset, 0.000001);
      float ratio = clamp((clamped - previousOffset) / span, 0.0, 1.0);
      return mix(previousColor, currentColor, ratio);
    }

    previousOffset = currentOffset;
    previousColor = currentColor;
  }

  return previousColor;
}

void main() {
  vec4 gradientColor = sampleGradient(resolveGradientT());
  vec4 tint = vec4(u_tint.rgb / 255.0, u_tint.a);
  outColor = gradientColor * tint;
}`;

export type GradientMode = 'linear' | 'radial';

export interface GradientStop {
  offset: number;
  color: Color;
}

export interface GradientOptions {
  width: number;
  height: number;
  stops: readonly GradientStop[];
  mode?: GradientMode;
  linearStart?: readonly [number, number];
  linearEnd?: readonly [number, number];
  radialCenter?: readonly [number, number];
  radialRadius?: number;
}

interface InternalGradientStop {
  offset: number;
  color: Color;
}

const sortedStopOffset = (left: InternalGradientStop, right: InternalGradientStop): number => left.offset - right.offset;

const createShaderUniforms = (): Record<string, MeshShaderUniformValue> => {
  const uniforms: Record<string, MeshShaderUniformValue> = {};

  uniforms.u_mode = 0;
  uniforms.u_linearStart = new Float32Array([0, 0]);
  uniforms.u_linearEnd = new Float32Array([1, 0]);
  uniforms.u_radialCenter = new Float32Array([0.5, 0.5]);
  uniforms.u_radialRadius = 0.5;
  uniforms.u_stopCount = 2;
  uniforms.u_stopOffsets = new Float32Array(maxGradientStops);
  uniforms.u_stopColors = new Float32Array(maxGradientStops * 4);

  return uniforms;
};

/**
 * GPU-drawn rectangular gradient drawable.
 *
 * Supports linear and radial modes with up to 8 color stops and integrates
 * with the regular scene graph (`position`, `rotation`, `scale`, filters,
 * masks, blend modes). Coordinates for mode configuration are normalized:
 * `0..1` maps to the local gradient rectangle.
 *
 * WebGL2 is supported. For WebGPU backends this class is currently not wired
 * with a WGSL variant.
 */
export class GradientDrawable extends Mesh {
  private readonly _vertexData: Float32Array;
  private readonly _shader: MeshShader;
  private readonly _stopOffsets = new Float32Array(maxGradientStops);
  private readonly _stopColors = new Float32Array(maxGradientStops * 4);
  private readonly _linearStart = new Float32Array([0, 0]);
  private readonly _linearEnd = new Float32Array([1, 0]);
  private readonly _radialCenter = new Float32Array([0.5, 0.5]);
  private _stops: InternalGradientStop[] = [];
  private _width: number;
  private _height: number;
  private _mode: GradientMode = 'linear';
  private _radialRadius = 0.5;

  public constructor(options: GradientOptions) {
    const vertexData = new Float32Array([0, 0, options.width, 0, options.width, options.height, 0, options.height]);
    const shader = new MeshShader({
      glsl: {
        vertex: gradientVertexSource,
        fragment: gradientFragmentSource,
      },
      uniforms: createShaderUniforms(),
    });

    super({
      vertices: vertexData,
      indices: new Uint16Array([0, 1, 2, 0, 2, 3]),
      uvs: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]),
      shader,
    });

    this._vertexData = vertexData;
    this._shader = shader;
    this._width = options.width;
    this._height = options.height;

    this._validateSize(options.width, options.height);
    this.setStops(options.stops);

    if (options.linearStart) {
      this._linearStart[0] = options.linearStart[0];
      this._linearStart[1] = options.linearStart[1];
    }

    if (options.linearEnd) {
      this._linearEnd[0] = options.linearEnd[0];
      this._linearEnd[1] = options.linearEnd[1];
    }

    if (options.radialCenter) {
      this._radialCenter[0] = options.radialCenter[0];
      this._radialCenter[1] = options.radialCenter[1];
    }

    if (options.radialRadius !== undefined) {
      this._radialRadius = Math.max(0, options.radialRadius);
    }

    this._mode = options.mode ?? 'linear';
    this._syncUniforms();
  }

  public get width(): number {
    return this._width;
  }

  public get height(): number {
    return this._height;
  }

  public get mode(): GradientMode {
    return this._mode;
  }

  public get stops(): readonly GradientStop[] {
    return this._stops;
  }

  public setSize(width: number, height: number): this {
    this._validateSize(width, height);

    this._width = width;
    this._height = height;

    this._vertexData[2] = width;
    this._vertexData[4] = width;
    this._vertexData[5] = height;
    this._vertexData[7] = height;

    this.recomputeLocalBounds();
    this.invalidateCache();

    return this;
  }

  public setStops(stops: readonly GradientStop[]): this {
    if (stops.length < 2) {
      throw new Error('GradientDrawable requires at least 2 color stops.');
    }

    if (stops.length > maxGradientStops) {
      throw new Error(`GradientDrawable supports at most ${maxGradientStops} color stops.`);
    }

    for (const stop of this._stops) {
      stop.color.destroy();
    }

    this._stops = [...stops].map(stop => ({ offset: clamp(stop.offset, 0, 1), color: stop.color.clone() })).sort(sortedStopOffset);

    this._syncUniforms();
    this.invalidateCache();

    return this;
  }

  public setLinear(startX: number, startY: number, endX: number, endY: number): this {
    this._mode = 'linear';
    this._linearStart[0] = startX;
    this._linearStart[1] = startY;
    this._linearEnd[0] = endX;
    this._linearEnd[1] = endY;
    this._syncUniforms();
    this.invalidateCache();

    return this;
  }

  public setRadial(centerX: number, centerY: number, radius: number): this {
    this._mode = 'radial';
    this._radialCenter[0] = centerX;
    this._radialCenter[1] = centerY;
    this._radialRadius = Math.max(0, radius);
    this._syncUniforms();
    this.invalidateCache();

    return this;
  }

  public override destroy(): void {
    for (const stop of this._stops) {
      stop.color.destroy();
    }
    this._stops = [];

    super.destroy();
  }

  private _validateSize(width: number, height: number): void {
    if (!Number.isFinite(width) || !Number.isFinite(height) || width < 0 || height < 0) {
      throw new Error('GradientDrawable width/height must be finite numbers >= 0.');
    }
  }

  private _syncStopUniforms(): void {
    const stopCount = this._stops.length;
    const lastStop = this._stops[stopCount - 1];

    for (let index = 0; index < maxGradientStops; index++) {
      const stop = this._stops[index] ?? lastStop;
      const colorOffset = index * 4;

      this._stopOffsets[index] = stop.offset;
      this._stopColors[colorOffset] = stop.color.r / 255;
      this._stopColors[colorOffset + 1] = stop.color.g / 255;
      this._stopColors[colorOffset + 2] = stop.color.b / 255;
      this._stopColors[colorOffset + 3] = stop.color.a;
    }
  }

  private _syncUniforms(): void {
    this._syncStopUniforms();

    this._shader.uniforms.u_mode = this._mode === 'linear' ? 0 : 1;
    this._shader.uniforms.u_linearStart = this._linearStart;
    this._shader.uniforms.u_linearEnd = this._linearEnd;
    this._shader.uniforms.u_radialCenter = this._radialCenter;
    this._shader.uniforms.u_radialRadius = this._radialRadius;
    this._shader.uniforms.u_stopCount = this._stops.length;
    this._shader.uniforms.u_stopOffsets = this._stopOffsets;
    this._shader.uniforms.u_stopColors = this._stopColors;
  }
}
