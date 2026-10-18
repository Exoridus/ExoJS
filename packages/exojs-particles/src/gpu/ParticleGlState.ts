import type { Rectangle, Texture } from '@codexo/exojs';

import type { GlslContribution } from '#modules/GlslContribution';
import type { UpdateModule } from '#modules/UpdateModule';
import { getWgslFieldLayout, getWgslUniformByteSize, type WgslPrimitive } from '#modules/WgslContribution';
import type { ParticleSystem } from '#ParticleSystem';

import { composeParticleGlSource } from './particleGlSource';
import type { ParticleDeathRecord } from './ParticleGpuState';
import { ParticleModuleKeyCollisionError } from './ParticleModuleKeyCollisionError';
import fragmentSource from './shaders/particle-simulate.frag';

const stride = 80;
const varyingNames = [
  'o_position',
  'o_scale',
  'o_angle',
  'o_color',
  'o_uv',
  'o_velocity',
  'o_speed',
  'o_timing',
  'o_textureIndex',
  'o_marker',
  'o_slot',
  'o_simScale',
];

interface ModuleSlot {
  module: UpdateModule;
  contribution: GlslContribution;
  data: DataView;
  fields: Array<{ location: WebGLUniformLocation | null; offset: number; type: WgslPrimitive; values: Float32Array }>;
}

interface StagingSlot {
  buffer: WebGLBuffer;
  data: ArrayBuffer;
  sync: WebGLSync | null;
  count: number;
}

/** Owns the transform-feedback simulation and its directly renderable ping-pong buffers. */
export class ParticleGlState {
  /** The first 40 bytes match quad instances; simulation channels occupy the remaining 40 bytes. */
  public readonly instanceStride = stride;
  public onDestroy: (() => void) | null = null;

  private readonly _buffers: WebGLBuffer[] = [];
  private readonly _vaos: WebGLVertexArrayObject[] = [];
  private readonly _feedbacks: WebGLTransformFeedback[] = [];
  private readonly _textures: WebGLTexture[] = [];
  private readonly _textureUniforms: Array<WebGLUniformLocation | null> = [];
  private readonly _oldTextures: Array<WebGLTexture | null> = [];
  private readonly _oldSamplers: Array<WebGLSampler | null> = [];
  private readonly _expirySlots: number[] = [];
  private readonly _scratch = new ArrayBuffer(stride);
  private readonly _scratchFloats = new Float32Array(this._scratch);
  private readonly _scratchUints = new Uint32Array(this._scratch);
  private readonly _expiry = new Float32Array([1]);
  private readonly _staging: StagingSlot[] = [];
  private readonly _staged: StagingSlot[] = [];
  private _delivery: Promise<void> = Promise.resolve();
  private _backlog: WebGLBuffer | null = null;
  private _backlogCount = 0;
  private _frames: WebGLTexture | null = null;
  private _frameCount = 1;
  private _program: WebGLProgram | null = null;
  private _dtUniform: WebGLUniformLocation | null = null;
  private _framesUniform: WebGLUniformLocation | null = null;
  private _frameCountUniform: WebGLUniformLocation | null = null;
  private _modules: ModuleSlot[] = [];
  private _current = 0;
  private _destroyed = false;
  private _oldProgram: WebGLProgram | null = null;
  private _oldVao: WebGLVertexArrayObject | null = null;
  private _oldBuffer: WebGLBuffer | null = null;
  private _oldRead: WebGLBuffer | null = null;
  private _oldWrite: WebGLBuffer | null = null;
  private _oldFeedback: WebGLTransformFeedback | null = null;
  private _oldFeedbackBuffer: WebGLBuffer | null = null;
  private _oldActiveTexture = 0;
  private _oldDiscard = false;

  public constructor(
    public readonly gl: WebGL2RenderingContext,
    public readonly capacity: number,
    modules: readonly UpdateModule[],
    frames: readonly Rectangle[],
    texture: Texture,
    textureFrame: Rectangle,
    reportsDeaths = false,
  ) {
    if (gl.getParameter(gl.MAX_TRANSFORM_FEEDBACK_INTERLEAVED_COMPONENTS) < 20 || gl.getParameter(gl.MAX_VERTEX_ATTRIBS) < 10) {
      throw new Error('Particle transform feedback requires 20 interleaved components and 10 vertex attributes.');
    }

    this._capture();

    try {
      for (let i = 0; i < 2; i++) {
        const buffer = this._require(gl.createBuffer());

        this._buffers.push(buffer);
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, capacity * stride, gl.DYNAMIC_COPY);
        const vao = this._require(gl.createVertexArray());

        this._vaos.push(vao);
        gl.bindVertexArray(vao);
        const attributes = [
          [2, 0],
          [1, 16],
          [1, 20],
          [2, 40],
          [1, 48],
          [2, 52],
          [1, 60],
          [1, 64],
          [1, 68],
          [2, 72],
        ];

        for (let index = 0; index < attributes.length; index++) {
          const [size, offset] = attributes[index]!;

          gl.enableVertexAttribArray(index);

          if (index === 2 || index === 6 || index === 8) {
            gl.vertexAttribIPointer(index, size!, gl.UNSIGNED_INT, stride, offset!);
          } else {
            gl.vertexAttribPointer(index, size!, gl.FLOAT, false, stride, offset!);
          }
        }

        const feedback = this._require(gl.createTransformFeedback());

        this._feedbacks.push(feedback);
        gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, feedback);
        gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, buffer);
      }

      this._frames = this._require(gl.createTexture());
    } catch (error) {
      this.destroy();

      throw error;
    } finally {
      this._restore();
    }

    try {
      this.refreshFrames(frames, texture, textureFrame);
      this.setProgram(modules, reportsDeaths);
    } catch (error) {
      this.destroy();

      throw error;
    }
  }

  public get instanceBuffer(): WebGLBuffer {
    return this._buffers[this._current]!;
  }

  public get destroyed(): boolean {
    return this._destroyed;
  }

  public setProgram(modules: readonly UpdateModule[], reportsDeaths = false): void {
    const gl = this.gl;
    const contributions = modules.map(module => {
      const contribution = module.glsl?.();

      if (!contribution) {
        throw new Error('Particle transform feedback requires GLSL contributions.');
      }

      return contribution;
    });
    const keys = new Map<string, string>();

    for (let i = 0; i < contributions.length; i++) {
      const key = contributions[i]!.key;
      const previous = keys.get(key);

      if (previous !== undefined) {
        throw new ParticleModuleKeyCollisionError(key, previous, modules[i]!.constructor.name);
      }

      keys.set(key, modules[i]!.constructor.name);
    }

    const textureCount = contributions.reduce((count, item) => count + (item.textures?.length ?? 0), 1);

    if (
      textureCount > gl.getParameter(gl.MAX_VERTEX_TEXTURE_IMAGE_UNITS) ||
      textureCount > gl.getParameter(gl.MAX_COMBINED_TEXTURE_IMAGE_UNITS)
    ) {
      throw new Error('Particle transform feedback exceeds the available vertex texture units.');
    }

    const program = this._compile(composeParticleGlSource(contributions));

    this._capture(textureCount);

    try {
      this._deleteProgram();
      this._program = program;
      gl.useProgram(program);
      this._dtUniform = gl.getUniformLocation(program, 'u_dt');
      this._framesUniform = gl.getUniformLocation(program, 'u_frames');
      this._frameCountUniform = gl.getUniformLocation(program, 'u_frameCount');
      this._modules = contributions.map((contribution, index) => {
        const data = new DataView(new ArrayBuffer(Math.max(4, getWgslUniformByteSize(contribution.uniforms ?? []))));
        let offset = 0;
        const fields = (contribution.uniforms ?? []).map(field => {
          const layout = getWgslFieldLayout(field.type);

          offset = Math.ceil(offset / layout.align) * layout.align;
          const result = {
            location: gl.getUniformLocation(program, `u_${contribution.key}.${field.name}`),
            offset,
            type: field.type,
            values: new Float32Array(data.buffer, offset, layout.size / 4),
          };

          offset += layout.size;

          return result;
        });
        const module = modules[index]!;
        const textureData = module.textureData?.();

        for (const binding of contribution.textures ?? []) {
          const pixels = textureData?.get(binding.name);

          if (!pixels) {
            throw new Error(`Missing particle lookup texture: ${contribution.key}.${binding.name}`);
          }

          const lookup = this._require(gl.createTexture());

          this._textures.push(lookup);
          this._textureUniforms.push(gl.getUniformLocation(program, `u_${contribution.key}_${binding.name}`));
          gl.activeTexture(gl.TEXTURE0 + this._textures.length);
          gl.bindTexture(gl.TEXTURE_2D, lookup);
          this._textureParameters();
          const scalar = binding.format === 'r32float';

          this._uploadPixels(
            scalar ? gl.R32F : gl.RGBA8,
            pixels.length / (scalar ? 1 : 4),
            scalar ? gl.RED : gl.RGBA,
            scalar ? gl.FLOAT : gl.UNSIGNED_BYTE,
            pixels,
          );
        }

        return { module, contribution, data, fields };
      });

      if (reportsDeaths && !this._backlog) {
        this._backlog = this._require(gl.createBuffer());
        gl.bindBuffer(gl.COPY_WRITE_BUFFER, this._backlog);
        gl.bufferData(gl.COPY_WRITE_BUFFER, this.capacity * stride, gl.DYNAMIC_COPY);

        for (let i = 0; i < 3; i++) {
          const buffer = this._require(gl.createBuffer());

          this._staging.push({ buffer, data: new ArrayBuffer(this.capacity * stride), sync: null, count: 0 });
          gl.bindBuffer(gl.COPY_WRITE_BUFFER, buffer);
          gl.bufferData(gl.COPY_WRITE_BUFFER, this.capacity * stride, gl.STREAM_READ);
        }
      } else if (!reportsDeaths) {
        this._deleteDeaths();
      }
    } catch (error) {
      this._deleteProgram();

      throw error;
    } finally {
      this._restore();
    }
  }

  public refreshFrames(frames: readonly Rectangle[], texture: Texture, textureFrame: Rectangle): void {
    if (this._destroyed) {
      return;
    }

    const gl = this.gl;
    const count = Math.max(1, frames.length);

    if (count > gl.getParameter(gl.MAX_TEXTURE_SIZE)) {
      throw new Error('Particle atlas exceeds the transform feedback frame lookup size.');
    }

    const data = new Float32Array(count * 4);

    for (let i = 0; i < count; i++) {
      const frame = frames[i] ?? textureFrame;

      data.set(
        [
          frame.left / texture.width,
          (texture.flipY ? frame.bottom : frame.top) / texture.height,
          frame.right / texture.width,
          (texture.flipY ? frame.top : frame.bottom) / texture.height,
        ],
        i * 4,
      );
    }

    this._capture(1);

    try {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this._frames);
      this._textureParameters();
      this._uploadPixels(gl.RGBA32F, count, gl.RGBA, gl.FLOAT, data);
      this._frameCount = count;
    } finally {
      this._restore();
    }
  }

  public uploadDirty(system: ParticleSystem, slots: Iterable<number>): void {
    const gl = this.gl;
    const storage = system._storage;
    const f = this._scratchFloats;
    const u = this._scratchUints;
    const previous = gl.getParameter(gl.ARRAY_BUFFER_BINDING) as WebGLBuffer | null;

    gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuffer);

    try {
      for (const slot of slots) {
        f[0] = storage.posX[slot]!;
        f[1] = storage.posY[slot]!;
        f[2] = storage.scaleX[slot]!;
        f[3] = storage.scaleY[slot]!;
        f[4] = storage.rotations[slot]!;
        u[5] = storage.color[slot]!;
        f[10] = storage.velX[slot]!;
        f[11] = storage.velY[slot]!;
        f[12] = storage.rotationSpeeds[slot]!;
        f[13] = storage.elapsed[slot]!;
        f[14] = storage.lifetime[slot]!;
        u[15] = storage.frame[slot]!;
        f[16] = 0;
        u[17] = slot;
        f[18] = storage.scaleX[slot]!;
        f[19] = storage.scaleY[slot]!;
        gl.bufferSubData(gl.ARRAY_BUFFER, slot * stride, f);
      }
    } finally {
      gl.bindBuffer(gl.ARRAY_BUFFER, previous);
    }
  }

  public uploadExpiry(slot: number, report = true): void {
    const gl = this.gl;
    const previous = gl.getParameter(gl.ARRAY_BUFFER_BINDING) as WebGLBuffer | null;

    gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, slot * stride + 64, this._expiry);
    gl.bindBuffer(gl.ARRAY_BUFFER, previous);

    if (report) {
      this._expirySlots.push(slot);
    }
  }

  /** Advances simulation and returns whether a death batch was staged, including any earlier backlog. */
  public dispatch(dt: number, liveCount: number, _pendingDeathCount = 0): boolean {
    if (this._destroyed || !this._program || this.gl.isContextLost()) {
      return false;
    }

    const gl = this.gl;

    this._capture(this._textures.length + 1);

    try {
      gl.useProgram(this._program);
      gl.uniform1f(this._dtUniform, dt);
      gl.uniform1ui(this._frameCountUniform, this._frameCount);
      gl.uniform1i(this._framesUniform, 0);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this._frames);

      for (let i = 0; i < this._textures.length; i++) {
        gl.activeTexture(gl.TEXTURE0 + i + 1);
        gl.bindTexture(gl.TEXTURE_2D, this._textures[i]!);
        gl.uniform1i(this._textureUniforms[i]!, i + 1);
      }

      for (const slot of this._modules) {
        slot.module.writeUniforms?.(slot.data, 0, dt);

        for (const field of slot.fields) {
          if (field.type === 'f32') {
            gl.uniform1f(field.location, slot.data.getFloat32(field.offset, true));
          } else if (field.type === 'u32') {
            gl.uniform1ui(field.location, slot.data.getUint32(field.offset, true));
          } else if (field.type === 'i32') {
            gl.uniform1i(field.location, slot.data.getInt32(field.offset, true));
          } else if (field.type === 'vec2<f32>') {
            gl.uniform2fv(field.location, field.values);
          } else {
            gl.uniform4fv(field.location, field.values);
          }
        }
      }

      if (liveCount > 0) {
        const next = 1 - this._current;

        gl.bindVertexArray(this._vaos[this._current]!);
        gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, this._feedbacks[next]!);
        gl.enable(gl.RASTERIZER_DISCARD);
        gl.beginTransformFeedback(gl.POINTS);
        gl.drawArrays(gl.POINTS, 0, liveCount);
        gl.endTransformFeedback();
        gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, null);
        this._current = next;
      }

      const staged = this._stageDeaths();

      this._expirySlots.length = 0;

      return staged;
    } finally {
      this._restore();
    }
  }

  public readDeaths(consume: (records: readonly ParticleDeathRecord[]) => void): Promise<void> {
    const slot = this._staged.shift();

    if (!slot) {
      return this._delivery;
    }

    const sync = slot.sync;

    const deliver = async (): Promise<void> => {
      if (!sync) {
        return;
      }

      try {
        while (!this._destroyed && slot.sync === sync) {
          const status = this.gl.clientWaitSync(sync, 0, 0);

          if (status === this.gl.WAIT_FAILED) {
            return;
          }

          if (status !== this.gl.TIMEOUT_EXPIRED) {
            break;
          }

          await new Promise<void>(resolve => {
            setTimeout(resolve, 0);
          });
        }

        if (this._destroyed || slot.sync !== sync) {
          return;
        }

        const gl = this.gl;
        const previous = gl.getParameter(gl.COPY_READ_BUFFER_BINDING) as WebGLBuffer | null;
        const view = new Float32Array(slot.data, 0, slot.count * 20);
        const uints = new Uint32Array(slot.data);

        gl.bindBuffer(gl.COPY_READ_BUFFER, slot.buffer);

        try {
          gl.getBufferSubData(gl.COPY_READ_BUFFER, 0, view);
        } finally {
          gl.bindBuffer(gl.COPY_READ_BUFFER, previous);
        }

        const records: ParticleDeathRecord[] = [];

        for (let i = 0; i < slot.count; i++) {
          const o = i * 20;

          records.push({
            x: view[o]!,
            y: view[o + 1]!,
            velocityX: view[o + 10]!,
            velocityY: view[o + 11]!,
            rotation: view[o + 4]!,
            scaleX: view[o + 18]!,
            scaleY: view[o + 19]!,
            elapsed: view[o + 13]!,
            color: uints[o + 5]!,
            slot: uints[o + 17]!,
          });
        }

        consume(records);
      } finally {
        if (slot.sync === sync) {
          this.gl.deleteSync(sync);
          slot.sync = null;
          slot.count = 0;
        }
      }
    };

    const result = this._delivery.then(deliver, deliver);

    this._delivery = result.catch(() => {
      // A failed consumer must not prevent subsequent batches from releasing their resources.
    });

    return result;
  }

  public destroy(): void {
    if (this._destroyed) {
      return;
    }

    this._destroyed = true;
    this._deleteProgram();
    this._deleteDeaths();

    for (const vao of this._vaos) {
      this.gl.deleteVertexArray(vao);
    }

    for (const feedback of this._feedbacks) {
      this.gl.deleteTransformFeedback(feedback);
    }

    for (const buffer of this._buffers) {
      this.gl.deleteBuffer(buffer);
    }

    this.gl.deleteTexture(this._frames);
    this.onDestroy?.();
    this.onDestroy = null;
  }

  public discardDeaths(): void {
    this._backlogCount = 0;
    this._expirySlots.length = 0;

    for (const slot of this._staged) {
      this.gl.deleteSync(slot.sync);
      slot.sync = null;
      slot.count = 0;
    }

    this._staged.length = 0;
  }

  private _stageDeaths(): boolean {
    if (!this._backlog) {
      return false;
    }

    const gl = this.gl;

    gl.bindBuffer(gl.COPY_READ_BUFFER, this.instanceBuffer);
    gl.bindBuffer(gl.COPY_WRITE_BUFFER, this._backlog);

    // Slot reuse must not overwrite deaths waiting for a free asynchronous staging buffer.
    for (const slot of this._expirySlots) {
      if (this._backlogCount >= this.capacity) {
        break;
      }

      gl.copyBufferSubData(gl.COPY_READ_BUFFER, gl.COPY_WRITE_BUFFER, slot * stride, this._backlogCount++ * stride, stride);
    }

    if (!this._backlogCount) {
      return false;
    }

    let staging: StagingSlot | undefined;

    for (const slot of this._staging) {
      if (slot.sync === null) {
        staging = slot;
        break;
      }
    }

    if (!staging) {
      return false;
    }

    gl.bindBuffer(gl.COPY_READ_BUFFER, this._backlog);
    gl.bindBuffer(gl.COPY_WRITE_BUFFER, staging.buffer);
    gl.copyBufferSubData(gl.COPY_READ_BUFFER, gl.COPY_WRITE_BUFFER, 0, 0, this._backlogCount * stride);
    staging.sync = this._require(gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0));
    staging.count = this._backlogCount;
    this._backlogCount = 0;
    this._staged.push(staging);
    gl.flush();

    return true;
  }

  private _compile(source: string): WebGLProgram {
    const gl = this.gl;
    const program = this._require(gl.createProgram());
    const shaders: WebGLShader[] = [];

    try {
      for (const [type, text] of [
        [gl.VERTEX_SHADER, source],
        [gl.FRAGMENT_SHADER, fragmentSource],
      ] as const) {
        const shader = this._require(gl.createShader(type));

        shaders.push(shader);
        gl.shaderSource(shader, text);
        gl.compileShader(shader);

        if (gl.getShaderParameter(shader, gl.COMPILE_STATUS) !== true) {
          throw new Error(`Particle transform feedback shader: ${gl.getShaderInfoLog(shader) ?? 'unknown error'}`);
        }

        gl.attachShader(program, shader);
      }

      gl.transformFeedbackVaryings(program, varyingNames, gl.INTERLEAVED_ATTRIBS);
      gl.linkProgram(program);

      if (gl.getProgramParameter(program, gl.LINK_STATUS) !== true) {
        throw new Error(`Particle transform feedback program: ${gl.getProgramInfoLog(program) ?? 'unknown error'}`);
      }

      return program;
    } catch (error) {
      gl.deleteProgram(program);

      throw error;
    } finally {
      for (const shader of shaders) {
        gl.deleteShader(shader);
      }
    }
  }

  private _deleteProgram(): void {
    this.gl.deleteProgram(this._program);
    this._program = null;

    for (const texture of this._textures) {
      this.gl.deleteTexture(texture);
    }

    this._textures.length = 0;
    this._textureUniforms.length = 0;
  }

  private _deleteDeaths(): void {
    this.gl.deleteBuffer(this._backlog);
    this._backlog = null;
    this._backlogCount = 0;

    for (const slot of this._staging) {
      this.gl.deleteSync(slot.sync);
      this.gl.deleteBuffer(slot.buffer);
      slot.sync = null;
    }

    this._staging.length = 0;
    this._staged.length = 0;
  }

  private _textureParameters(): void {
    const gl = this.gl;

    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  private _uploadPixels(
    internalFormat: number,
    width: number,
    format: number,
    type: number,
    data: Float32Array<ArrayBuffer> | Uint8Array<ArrayBuffer>,
  ): void {
    const gl = this.gl;
    const unpack = gl.getParameter(gl.PIXEL_UNPACK_BUFFER_BINDING) as WebGLBuffer | null;
    const parameters = [
      gl.UNPACK_ALIGNMENT,
      gl.UNPACK_ROW_LENGTH,
      gl.UNPACK_SKIP_PIXELS,
      gl.UNPACK_SKIP_ROWS,
      gl.UNPACK_FLIP_Y_WEBGL,
      gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,
    ];
    const previous = parameters.map(parameter => Number(gl.getParameter(parameter)));

    gl.bindBuffer(gl.PIXEL_UNPACK_BUFFER, null);

    try {
      for (let i = 0; i < parameters.length; i++) {
        gl.pixelStorei(parameters[i]!, i === 0 ? 1 : 0);
      }

      gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, width, 1, 0, format, type, data);
    } finally {
      for (let i = 0; i < parameters.length; i++) {
        gl.pixelStorei(parameters[i]!, previous[i]!);
      }

      gl.bindBuffer(gl.PIXEL_UNPACK_BUFFER, unpack);
    }
  }

  private _require<T>(resource: T | null): T {
    if (resource === null) {
      throw new Error('Particle transform feedback resource allocation failed.');
    }

    return resource;
  }

  private _capture(textureUnits = 0): void {
    const gl = this.gl;

    this._oldProgram = gl.getParameter(gl.CURRENT_PROGRAM) as WebGLProgram | null;
    this._oldVao = gl.getParameter(gl.VERTEX_ARRAY_BINDING) as WebGLVertexArrayObject | null;
    this._oldBuffer = gl.getParameter(gl.ARRAY_BUFFER_BINDING) as WebGLBuffer | null;
    this._oldRead = gl.getParameter(gl.COPY_READ_BUFFER_BINDING) as WebGLBuffer | null;
    this._oldWrite = gl.getParameter(gl.COPY_WRITE_BUFFER_BINDING) as WebGLBuffer | null;
    this._oldFeedback = gl.getParameter(gl.TRANSFORM_FEEDBACK_BINDING) as WebGLTransformFeedback | null;
    this._oldFeedbackBuffer = gl.getParameter(gl.TRANSFORM_FEEDBACK_BUFFER_BINDING) as WebGLBuffer | null;
    this._oldDiscard = gl.isEnabled(gl.RASTERIZER_DISCARD);
    this._oldActiveTexture = gl.getParameter(gl.ACTIVE_TEXTURE) as number;
    this._oldTextures.length = textureUnits;
    this._oldSamplers.length = textureUnits;

    for (let i = 0; i < textureUnits; i++) {
      gl.activeTexture(gl.TEXTURE0 + i);
      this._oldTextures[i] = gl.getParameter(gl.TEXTURE_BINDING_2D) as WebGLTexture | null;
      this._oldSamplers[i] = gl.getParameter(gl.SAMPLER_BINDING) as WebGLSampler | null;
      gl.bindSampler(i, null);
    }
  }

  private _restore(): void {
    const gl = this.gl;

    gl.useProgram(this._oldProgram);
    gl.bindVertexArray(this._oldVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this._oldBuffer);
    gl.bindBuffer(gl.COPY_READ_BUFFER, this._oldRead);
    gl.bindBuffer(gl.COPY_WRITE_BUFFER, this._oldWrite);
    gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, this._oldFeedback);
    gl.bindBuffer(gl.TRANSFORM_FEEDBACK_BUFFER, this._oldFeedbackBuffer);

    if (this._oldDiscard) {
      gl.enable(gl.RASTERIZER_DISCARD);
    } else {
      gl.disable(gl.RASTERIZER_DISCARD);
    }

    for (let i = 0; i < this._oldTextures.length; i++) {
      gl.activeTexture(gl.TEXTURE0 + i);
      gl.bindTexture(gl.TEXTURE_2D, this._oldTextures[i]!);
      gl.bindSampler(i, this._oldSamplers[i]!);
    }

    gl.activeTexture(this._oldActiveTexture);
  }
}
