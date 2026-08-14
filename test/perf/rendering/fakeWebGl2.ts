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
 * merges up to 16 textures into one draw via per-instance slots, and the "17th
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
  /** Transform rows uploaded this frame (rows span the store's texture lines). */
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

/** Bytes per typed-array element, for sizing an upload expressed as an element offset. */
const elementBytesOf = (data: unknown): number => (ArrayBuffer.isView(data) ? ((data as { BYTES_PER_ELEMENT?: number }).BYTES_PER_ELEMENT ?? 1) : 1);

/**
 * Channel count behind a GL pixel-format constant. Read off the same global
 * `WebGL2RenderingContext` the backend's format table reads (the stub installed
 * by {@link installFakeWebGl2Globals} under Node, the real class in a browser),
 * so the two always agree on which value means `RED`.
 */
const channelsOfFormat = (format: unknown): number => {
  const gl = (globalThis as Record<string, unknown>)['WebGL2RenderingContext'] as Record<string, number> | undefined;

  return gl !== undefined && format === gl['RED'] ? 1 : 4;
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
  MAX_TEXTURE_SIZE: constantFor('MAX_TEXTURE_SIZE'),
  RGBA32F: constantFor('RGBA32F'),
  NO_ERROR: 0,
};

// Texels one transform row occupies; mirrors TRANSFORM_TEXELS_PER_ROW, kept
// local so the fake stays a pure GL stand-in with no engine imports.
const transformTexelsPerRow = 2;

// A desktop-class texture limit, so the transform store's layout is built
// against a realistic bound rather than the fake's generic query answer.
const fakeMaxTextureSize = 16384;

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
  // Texture bound per unit, and the set of handles allocated as a transform row
  // store — an upload is attributed by identity rather than by guessing from
  // the rectangle it writes. Per UNIT because the backend rebinds through a
  // scratch unit and restores the active one, so a single "last bound" would go
  // stale as soon as two textures are live at once.
  const boundByUnit = new Map<number, object | null>();
  const transformStores = new WeakSet<object>();
  const boundTexture = (): object | null => boundByUnit.get(activeUnit) ?? null;

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
    getParameter: (pname: number): number => (pname === C.MAX_TEXTURE_SIZE ? fakeMaxTextureSize : 16),
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
    texImage2D: (...args: unknown[]): void => recordTextureUpload(args, true),
    texSubImage2D: (...args: unknown[]): void => recordTextureUpload(args, false),
    bindTexture: (_target: number, texture: object | null): void => {
      boundByUnit.set(activeUnit, texture);

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

  // Transform rows pack several per texture line, so a transform upload is no
  // longer identifiable by a width of 2 and its row count is no longer the
  // rectangle's height. Identify the store at ALLOCATION instead — the only
  // rgba32f texture whose width is a power-of-two multiple of the row's texel
  // count, which the row stores guarantee by doubling their capacity from 16
  // (Text's own rgba32f node-data store is 10 texels per row, so it is excluded,
  // exactly as the width-2 test used to exclude it). Tint lives in its own rgba8
  // texture and is intentionally NOT folded into this transform-specific metric.
  const isPowerOfTwo = (value: number): boolean => value >= 1 && (value & (value - 1)) === 0;

  const recordTextureUpload = (args: unknown[], isAllocation: boolean): void => {
    // texImage2D(target, level, internalFormat, width, height, border, format, type, data?)
    // texSubImage2D(target, level, xoffset, yoffset, width, height, format, type, data?)
    // texSubImage2D(target, level, xoffset, yoffset, width, height, format, type, srcData, srcOffset)
    // Both forms carry four numbers in a row, so the caller says which it is.
    const width = isAllocation ? (args[3] as number) : (args[4] as number);
    const height = isAllocation ? (args[4] as number) : (args[5] as number);
    // The `srcOffset` overload hands GL the WHOLE texture buffer plus an
    // element offset, so its byte length describes the texture rather than the
    // uploaded region. Size that upload from the region instead, otherwise a
    // full-width band would be booked as the entire buffer.
    const srcOffsetForm = args.length === 10 && ArrayBuffer.isView(args[8]) && typeof args[9] === 'number';
    const data = srcOffsetForm ? args[8] : args[args.length - 1];
    const bytes = srcOffsetForm ? width * height * channelsOfFormat(args[6]) * elementBytesOf(data) : byteLengthOf(data);

    recorder.textureUploads++;
    recorder.textureUploadBytes += bytes;

    const texture = boundTexture();

    if (isAllocation && texture !== null) {
      const isTransformStore =
        args[2] === C.RGBA32F && width % transformTexelsPerRow === 0 && isPowerOfTwo(width / transformTexelsPerRow) && width / transformTexelsPerRow >= 2;

      if (isTransformStore) {
        transformStores.add(texture);
      } else {
        transformStores.delete(texture);
      }
    }

    // Allocation is not an upload: `transformUploads` counts the per-frame
    // re-uploads a steady frame must avoid, and the store's initial texImage2D
    // is neither per-frame nor avoidable.
    if (!isAllocation && texture !== null && transformStores.has(texture)) {
      recorder.transformUploads++;
      // Rows, not texture lines: a rect `width` texels wide and `height` lines
      // tall carries `width / texelsPerRow * height` transform rows.
      recorder.transformRows = Math.max(recorder.transformRows, (width / transformTexelsPerRow) * height);
      recorder.transformUploadBytes += bytes;
    }
  };

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
