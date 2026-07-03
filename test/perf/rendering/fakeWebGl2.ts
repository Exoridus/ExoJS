/**
 * Recording fake WebGL2 context for deterministic, GPU-free renderer benchmarks.
 *
 * The real {@link WebGl2Backend} and its renderers are driven against this fake
 * context so the *actual* batching, multi-texture-slot, flush, and upload code
 * paths run in Node — no browser, no GPU. The fake records every structurally
 * relevant GL call (draw, bind, upload) into a {@link GlRecorder}; combined with
 * the backend's own `RenderStats`, that yields reproducible structural metrics
 * (draw calls, batches, texture binds, uploaded bytes, transform rows).
 *
 * Why a fake context rather than the plan layer? Plan-level grouping
 * (`pipelineKey:bindKey`) is NOT the same as GPU draw calls: the sprite renderer
 * merges up to 8 textures into one draw via per-instance slots, and the "9th
 * texture → flush" boundary lives inside the renderer. Only running the real
 * renderer reproduces that.
 *
 * Fidelity contract: the fake never executes shaders, so values returned from
 * reflection/queries only need to be *internally consistent*, not real WebGL2
 * constants. Method dispatch is by the WebGL2 naming convention — every API
 * method is camelCase, every enum constant is UPPER_SNAKE — which is exact for
 * WebGL2. Reflection is parsed from the real GLSL source the renderer compiles,
 * so attribute/uniform name lookups (`getAttribute('a_localBounds')`) resolve.
 *
 * @internal Test/perf-only. Not shipped, not a public API.
 */
import { ShaderPrimitives } from '#rendering/types';

/** Map a GLSL type token to the {@link ShaderPrimitives} GLenum the engine expects. */
const glslTypeToShaderPrimitive: Record<string, number> = {
  float: ShaderPrimitives.Float,
  vec2: ShaderPrimitives.FloatVec2,
  vec3: ShaderPrimitives.FloatVec3,
  vec4: ShaderPrimitives.FloatVec4,
  int: ShaderPrimitives.Int,
  ivec2: ShaderPrimitives.IntVec2,
  ivec3: ShaderPrimitives.IntVec3,
  ivec4: ShaderPrimitives.IntVec4,
  uint: ShaderPrimitives.UnsignedInt,
  uvec2: ShaderPrimitives.UnsignedIntVec2,
  uvec3: ShaderPrimitives.UnsignedIntVec3,
  uvec4: ShaderPrimitives.UnsignedIntVec4,
  bool: ShaderPrimitives.Bool,
  bvec2: ShaderPrimitives.BoolVec2,
  bvec3: ShaderPrimitives.BoolVec3,
  bvec4: ShaderPrimitives.BoolVec4,
  mat2: ShaderPrimitives.FloatMat2,
  mat3: ShaderPrimitives.FloatMat3,
  mat4: ShaderPrimitives.FloatMat4,
  sampler2D: ShaderPrimitives.Sampler2D,
};

interface ReflectedVar {
  readonly name: string;
  readonly type: number;
  readonly size: number;
  readonly location: number;
}

interface ProgramReflection {
  readonly attributes: ReflectedVar[];
  readonly uniforms: ReflectedVar[];
}

const ATTRIBUTE_LINE = /^\s*(?:layout\s*\(\s*location\s*=\s*(\d+)\s*\)\s*)?in\s+(\w+)\s+(\w+)\s*;/;
const UNIFORM_LINE = /^\s*uniform\s+(\w+)\s+(\w+)\s*;/;

/**
 * Parse vertex/fragment GLSL into the attribute + uniform reflection the engine
 * extracts via `getActiveAttrib` / `getActiveUniform`. Attributes come from the
 * vertex stage's global `in` declarations only (fragment `in` are varyings);
 * uniforms come from both stages, de-duplicated by name.
 */
export const reflectShaderSources = (vertexSource: string, fragmentSource: string): ProgramReflection => {
  const attributes: ReflectedVar[] = [];
  let nextLocation = 0;

  for (const rawLine of vertexSource.split('\n')) {
    const match = ATTRIBUTE_LINE.exec(rawLine);

    if (match === null) {
      continue;
    }

    const explicit = match[1];
    const type = glslTypeToShaderPrimitive[match[2]] ?? ShaderPrimitives.FloatVec4;
    const location = explicit !== undefined ? Number(explicit) : nextLocation;

    nextLocation = location + 1;
    attributes.push({ name: match[3], type, size: 1, location });
  }

  const uniforms: ReflectedVar[] = [];
  const seenUniforms = new Set<string>();

  for (const source of [vertexSource, fragmentSource]) {
    for (const rawLine of source.split('\n')) {
      const match = UNIFORM_LINE.exec(rawLine);

      if (match === null || seenUniforms.has(match[2])) {
        continue;
      }

      seenUniforms.add(match[2]);
      uniforms.push({ name: match[2], type: glslTypeToShaderPrimitive[match[1]] ?? ShaderPrimitives.Float, size: 1, location: uniforms.length });
    }
  }

  return { attributes, uniforms };
};

/** A single recorded GPU upload, classified by target. */
export interface RecordedUpload {
  readonly kind: 'buffer' | 'texture';
  readonly bytes: number;
  /** Orphaning reallocation (`bufferData`) vs in-place (`bufferSubData`). */
  readonly orphan: boolean;
}

/**
 * Accumulates structural GL-call counts for one or more frames. Reset between
 * measured frames via {@link reset}; totals are read after `backend.flush()`.
 */
export class GlRecorder {
  public drawCalls = 0;
  public instances = 0;
  public bufferUploads = 0;
  public bufferUploadBytes = 0;
  /** `bufferData` calls — orphaning reallocations that discard the old store. */
  public bufferReallocations = 0;
  /** `bufferSubData` calls — in-place updates of an existing store. */
  public bufferSubUpdates = 0;
  public textureBinds = 0;
  public textureUploads = 0;
  public textureUploadBytes = 0;
  public samplerBinds = 0;
  /** Distinct consecutive `useProgram` bindings — WebGL2's pipeline-change proxy. */
  public programChanges = 0;
  /** `blendFunc` calls — the backend only issues one per real blend-state change. */
  public blendChanges = 0;
  public scissorChanges = 0;
  /** Transform-texture rows uploaded this frame (height of the width-3 rgba32f upload). */
  public transformRows = 0;
  public transformUploadBytes = 0;
  /** Number of transform-texture uploads (zero when the frame's transforms are unchanged). */
  public transformUploads = 0;

  private _lastProgram: object | null = null;

  public reset(): this {
    this.drawCalls = 0;
    this.instances = 0;
    this.bufferUploads = 0;
    this.bufferUploadBytes = 0;
    this.bufferReallocations = 0;
    this.bufferSubUpdates = 0;
    this.textureBinds = 0;
    this.textureUploads = 0;
    this.textureUploadBytes = 0;
    this.samplerBinds = 0;
    this.programChanges = 0;
    this.blendChanges = 0;
    this.scissorChanges = 0;
    this.transformRows = 0;
    this.transformUploadBytes = 0;
    this.transformUploads = 0;
    this._lastProgram = null;

    return this;
  }

  /** @internal */
  public _recordProgram(program: object | null): void {
    if (program !== null && program !== this._lastProgram) {
      this.programChanges++;
      this._lastProgram = program;
    }
  }
}

const byteLengthOf = (data: unknown): number => {
  if (data instanceof ArrayBuffer) {
    return data.byteLength;
  }

  if (ArrayBuffer.isView(data)) {
    return data.byteLength;
  }

  return 0;
};

// A deterministic numeric value for any UPPER_SNAKE GL constant. Values need only
// be internally consistent (the fake both produces and consumes them); they are
// never compared to real WebGL2 enums.
const constantCache = new Map<string, number>();
const constantFor = (name: string): number => {
  let value = constantCache.get(name);

  if (value === undefined) {
    let hash = 0x811c9dc5;

    for (let i = 0; i < name.length; i++) {
      hash = Math.imul(hash ^ name.charCodeAt(i), 0x01000193) >>> 0;
    }

    value = hash;
    constantCache.set(name, value);
  }

  return value;
};

// Pre-seed the constants the fake itself dispatches on so getProgramParameter /
// getShaderParameter / createShader can branch deterministically.
const C = {
  VERTEX_SHADER: constantFor('VERTEX_SHADER'),
  FRAGMENT_SHADER: constantFor('FRAGMENT_SHADER'),
  COMPILE_STATUS: constantFor('COMPILE_STATUS'),
  LINK_STATUS: constantFor('LINK_STATUS'),
  ACTIVE_ATTRIBUTES: constantFor('ACTIVE_ATTRIBUTES'),
  ACTIVE_UNIFORMS: constantFor('ACTIVE_UNIFORMS'),
  ACTIVE_UNIFORM_BLOCKS: constantFor('ACTIVE_UNIFORM_BLOCKS'),
  TEXTURE0: constantFor('TEXTURE0'),
  NO_ERROR: 0,
};

interface FakeShader {
  glType: number;
  source: string;
}

interface FakeProgram {
  shaders: FakeShader[];
  reflection: ProgramReflection | null;
}

/**
 * Build a fake `WebGL2RenderingContext`. Explicit methods cover the
 * reflection/query contract and the recorded calls; a Proxy supplies recording
 * no-ops for every other camelCase method and deterministic numbers for every
 * UPPER_SNAKE constant.
 */
export const createFakeWebGl2Context = (recorder: GlRecorder): WebGL2RenderingContext => {
  let handleSeq = 1;
  const newHandle = (tag: string): object => ({ __fake: tag, id: handleSeq++ });

  let activeUnit = 0;

  const base: Record<string, unknown> = {
    // ── object lifecycle ────────────────────────────────────────────────
    createShader: (type: number): FakeShader => ({ glType: type, source: '' }),
    shaderSource: (shader: FakeShader, source: string): void => {
      shader.source = source;
    },
    compileShader: (): void => {},
    createProgram: (): FakeProgram => ({ shaders: [], reflection: null }),
    attachShader: (program: FakeProgram, shader: FakeShader): void => {
      program.shaders.push(shader);
    },
    linkProgram: (program: FakeProgram): void => {
      const vertex = program.shaders.find(s => s.glType === C.VERTEX_SHADER)?.source ?? '';
      const fragment = program.shaders.find(s => s.glType === C.FRAGMENT_SHADER)?.source ?? '';

      program.reflection = reflectShaderSources(vertex, fragment);
    },
    deleteShader: (): void => {},
    deleteProgram: (): void => {},
    createBuffer: (): object => newHandle('buffer'),
    deleteBuffer: (): void => {},
    createVertexArray: (): object => newHandle('vao'),
    deleteVertexArray: (): void => {},
    createTexture: (): object => newHandle('texture'),
    deleteTexture: (): void => {},
    createFramebuffer: (): object => newHandle('framebuffer'),
    deleteFramebuffer: (): void => {},
    createRenderbuffer: (): object => newHandle('renderbuffer'),
    deleteRenderbuffer: (): void => {},
    createSampler: (): object => newHandle('sampler'),
    deleteSampler: (): void => {},

    // ── reflection / queries ────────────────────────────────────────────
    getShaderParameter: (_shader: FakeShader, pname: number): unknown => (pname === C.COMPILE_STATUS ? true : 0),
    getProgramParameter: (program: FakeProgram, pname: number): unknown => {
      const reflection = program.reflection ?? { attributes: [], uniforms: [] };

      switch (pname) {
        case C.LINK_STATUS:
          return true;
        case C.ACTIVE_ATTRIBUTES:
          return reflection.attributes.length;
        case C.ACTIVE_UNIFORMS:
          return reflection.uniforms.length;
        case C.ACTIVE_UNIFORM_BLOCKS:
          return 0;
        default:
          return 0;
      }
    },
    getActiveAttrib: (program: FakeProgram, index: number): ReflectedVar | null => program.reflection?.attributes[index] ?? null,
    getAttribLocation: (program: FakeProgram, name: string): number => program.reflection?.attributes.find(a => a.name === name)?.location ?? -1,
    getActiveUniform: (program: FakeProgram, index: number): ReflectedVar | null => program.reflection?.uniforms[index] ?? null,
    getActiveUniforms: (_program: FakeProgram, indices: ArrayLike<number>): number[] => Array.from({ length: indices.length }, () => -1),
    getUniformLocation: (_program: FakeProgram, name: string): object => ({ __fake: 'uniformLocation', name }),
    getShaderInfoLog: (): string => '',
    getProgramInfoLog: (): string => '',
    getExtension: (): null => null,
    getParameter: (): number => 16,
    getError: (): number => C.NO_ERROR,
    isContextLost: (): boolean => false,

    // ── recorded draw / state ───────────────────────────────────────────
    drawArraysInstanced: (_mode: number, _first: number, _count: number, instanceCount: number): void => {
      recorder.drawCalls++;
      recorder.instances += instanceCount;
    },
    drawElementsInstanced: (_mode: number, _count: number, _type: number, _offset: number, instanceCount: number): void => {
      recorder.drawCalls++;
      recorder.instances += instanceCount;
    },
    drawArrays: (): void => {
      recorder.drawCalls++;
    },
    drawElements: (): void => {
      recorder.drawCalls++;
    },
    bufferData: (_target: number, data: unknown, _usage: number): void => {
      const bytes = typeof data === 'number' ? data : byteLengthOf(data);

      recorder.bufferUploads++;
      recorder.bufferReallocations++;
      recorder.bufferUploadBytes += bytes;
    },
    bufferSubData: (_target: number, _offset: number, data: unknown): void => {
      const bytes = byteLengthOf(data);

      recorder.bufferUploads++;
      recorder.bufferSubUpdates++;
      recorder.bufferUploadBytes += bytes;
    },
    texImage2D: (...args: unknown[]): void => recordTextureUpload(args),
    texSubImage2D: (...args: unknown[]): void => recordTextureUpload(args),
    bindTexture: (_target: number, texture: object | null): void => {
      if (texture !== null) {
        recorder.textureBinds++;
      }
    },
    bindSampler: (_unit: number, sampler: object | null): void => {
      if (sampler !== null) {
        recorder.samplerBinds++;
      }
    },
    useProgram: (program: object | null): void => {
      recorder._recordProgram(program);
    },
    blendFunc: (): void => {
      recorder.blendChanges++;
    },
    blendFuncSeparate: (): void => {
      recorder.blendChanges++;
    },
    scissor: (): void => {
      recorder.scissorChanges++;
    },
    activeTexture: (unit: number): void => {
      activeUnit = unit - C.TEXTURE0;
    },
  };

  // The transform texture is the only width-3 rgba32f upload (commitRect(0,0,3,count)):
  // its height is the transform-row count uploaded this frame.
  const recordTextureUpload = (args: unknown[]): void => {
    // texImage2D(target, level, internalFormat, width, height, border, format, type, data?)
    // texSubImage2D(target, level, xoffset, yoffset, width, height, format, type, data?)
    const isSub = args.length >= 9 && typeof args[2] === 'number' && typeof args[3] === 'number' && typeof args[4] === 'number' && typeof args[5] === 'number';
    const width = isSub ? (args[4] as number) : (args[3] as number);
    const height = isSub ? (args[5] as number) : (args[4] as number);
    const data = args[args.length - 1];
    const bytes = byteLengthOf(data);

    recorder.textureUploads++;
    recorder.textureUploadBytes += bytes;

    if (width === 3) {
      recorder.transformUploads++;
      recorder.transformRows = Math.max(recorder.transformRows, typeof height === 'number' ? height : 0);
      recorder.transformUploadBytes += bytes;
    }
  };

  void activeUnit;

  return new Proxy(base, {
    get(target, prop, receiver): unknown {
      if (typeof prop !== 'string') {
        return Reflect.get(target, prop, receiver);
      }

      if (prop in target) {
        return target[prop];
      }

      const first = prop.charCodeAt(0);

      // UPPER_SNAKE (A–Z) → enum constant; everything else is a method name.
      if (first >= 65 && first <= 90) {
        return constantFor(prop);
      }

      // Unknown camelCase method → cache a recording no-op so identity is stable.
      const noop = (): void => {};

      target[prop] = noop;

      return noop;
    },
  }) as unknown as WebGL2RenderingContext;
};

/** Minimal HTMLCanvasElement stand-in whose `getContext('webgl2')` yields the fake. */
export const createFakeCanvas = (width: number, height: number, context: WebGL2RenderingContext): HTMLCanvasElement => {
  const canvas = {
    width,
    height,
    getContext: (kind: string): WebGL2RenderingContext | null => (kind === 'webgl2' ? context : null),
    addEventListener: (): void => {},
    removeEventListener: (): void => {},
  };

  return canvas as unknown as HTMLCanvasElement;
};

/**
 * jsdom does not define `WebGL2RenderingContext`; the backend's data-texture
 * format helper reads constants off the global class. Install a stub once so the
 * `rgba32f` transform-texture path resolves. Values are arbitrary but stable.
 */
export const installFakeWebGl2Globals = (): void => {
  const globalScope = globalThis as Record<string, unknown>;

  if (typeof globalScope['WebGL2RenderingContext'] !== 'undefined') {
    return;
  }

  const stub: Record<string, number> = {};

  for (const name of ['R8', 'R32F', 'RGBA8', 'RGBA32F', 'RED', 'RGBA', 'UNSIGNED_BYTE', 'FLOAT']) {
    stub[name] = constantFor(name);
  }

  globalScope['WebGL2RenderingContext'] = stub;
};
