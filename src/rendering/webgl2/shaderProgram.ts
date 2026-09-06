import type { TypedArray } from '#core/types';
import { RenderBackendType } from '#rendering/RenderBackendType';
import { formatShaderError, RenderError } from '#rendering/RenderError';
import type { Shader, ShaderProgram } from '#rendering/shader/Shader';
import { ShaderAttribute } from '#rendering/shader/ShaderAttribute';
import { ShaderUniform } from '#rendering/shader/ShaderUniform';
import { resolveTransformTextureGlsl } from '#rendering/shader/transformTextureLayout';
import { ShaderPrimitives } from '#rendering/types';
import type { UniformBlockData } from '#rendering/uniforms/UniformBlockData';
import { generatedUniformBlockPrefix } from '#rendering/uniforms/uniformLayout';

import { webGl2PrimitiveArrayConstructors, webGl2PrimitiveByteSizeMapping } from './shaderMappings';
import { WebGl2ShaderBlock } from './WebGl2ShaderBlock';

type UniformUploadFunction = (gl: WebGL2RenderingContext, location: WebGLUniformLocation, value: TypedArray) => void;

interface ManagedUniform {
  readonly location: WebGLUniformLocation;
  readonly uploadFn: UniformUploadFunction;
  readonly uniform: ShaderUniform;
}

interface ParallelCompileExtension {
  // Naming-convention exception: this is a verbatim WebGL extension constant
  // exposed by the driver under its spec-defined uppercase name.
  readonly COMPLETION_STATUS_KHR: number;
}

const completionStatusEnumKhr = 0x91b1;

const uniformUploadFunctions: Record<number, UniformUploadFunction> = {
  [ShaderPrimitives.Float]: (gl, location, value): void => {
    // In-bounds: scalar uniforms are backed by a typed array of length >= 1.
    gl.uniform1f(location, value[0]!);
  },
  [ShaderPrimitives.FloatVec2]: (gl, location, value): void => {
    gl.uniform2fv(location, value);
  },
  [ShaderPrimitives.FloatVec3]: (gl, location, value): void => {
    gl.uniform3fv(location, value);
  },
  [ShaderPrimitives.FloatVec4]: (gl, location, value): void => {
    gl.uniform4fv(location, value);
  },

  [ShaderPrimitives.Int]: (gl, location, value): void => {
    // In-bounds: scalar uniforms are backed by a typed array of length >= 1.
    gl.uniform1i(location, value[0]!);
  },
  [ShaderPrimitives.IntVec2]: (gl, location, value): void => {
    gl.uniform2iv(location, value);
  },
  [ShaderPrimitives.IntVec3]: (gl, location, value): void => {
    gl.uniform3iv(location, value);
  },
  [ShaderPrimitives.IntVec4]: (gl, location, value): void => {
    gl.uniform4iv(location, value);
  },

  [ShaderPrimitives.Bool]: (gl, location, value): void => {
    // In-bounds: scalar uniforms are backed by a typed array of length >= 1.
    gl.uniform1i(location, value[0]!);
  },
  [ShaderPrimitives.BoolVec2]: (gl, location, value): void => {
    gl.uniform2iv(location, value);
  },
  [ShaderPrimitives.BoolVec3]: (gl, location, value): void => {
    gl.uniform3iv(location, value);
  },
  [ShaderPrimitives.BoolVec4]: (gl, location, value): void => {
    gl.uniform4iv(location, value);
  },

  [ShaderPrimitives.FloatMat2]: (gl, location, value): void => {
    gl.uniformMatrix2fv(location, false, value);
  },
  [ShaderPrimitives.FloatMat3]: (gl, location, value): void => {
    gl.uniformMatrix3fv(location, false, value);
  },
  [ShaderPrimitives.FloatMat4]: (gl, location, value): void => {
    gl.uniformMatrix4fv(location, false, value);
  },

  [ShaderPrimitives.Sampler2D]: (gl, location, value): void => {
    // In-bounds: scalar uniforms are backed by a typed array of length >= 1.
    gl.uniform1i(location, value[0]!);
  },
};

/**
 * Create the WebGL2 {@link ShaderProgram} runtime for a {@link Shader}.
 * Compilation/link status checks are deferred to first bind (see the
 * `KHR_parallel_shader_compile` note below); a compile or link failure at that
 * point throws a structured {@link RenderError} (`shader-compile` /
 * `shader-link`). `label` names the program in those errors (renderer name,
 * material label) - omit it when no cheap label is available.
 */
export const createWebGl2ShaderProgram = (gl: WebGL2RenderingContext, label?: string): ShaderProgram => {
  let program: WebGLProgram | null = null;
  let vertexShader: WebGLShader | null = null;
  let fragmentShader: WebGLShader | null = null;
  let pendingShader: Shader | null = null;
  // Sources after include expansion - what the driver actually compiled, so a
  // compile error's numbered excerpt lines up with the log's line numbers.
  let compiledVertexSource = '';
  let compiledFragmentSource = '';
  const managedUniforms: ManagedUniform[] = [];
  const uniformBlocks: WebGl2ShaderBlock[] = [];
  const schemaBlocks: SchemaBlockBinding[] = [];

  // Detect KHR_parallel_shader_compile. When present, the GL driver may
  // compile shaders on a worker thread; we can poll completion via
  // COMPLETION_STATUS_KHR without blocking. When absent, the very first
  // call to gl.getShaderParameter(COMPILE_STATUS) blocks until the driver
  // finishes compilation.
  //
  // Either way, this runtime defers the actual COMPILE_STATUS / LINK_STATUS
  // queries (and the attribute/uniform extraction that depends on them)
  // from initialize() to bind()/sync(). That way the driver gets the entire
  // window between renderer setup and first draw to compile in the
  // background. With the extension, that window is non-blocking; without
  // it, the eventual blocking query is hopefully a no-op because the work
  // already finished during asset loading or scene init.
  const parallelExt = gl.getExtension('KHR_parallel_shader_compile') as ParallelCompileExtension | null;
  const completionStatus = parallelExt?.COMPLETION_STATUS_KHR ?? completionStatusEnumKhr;

  const initialize = (shader: Shader): void => {
    if (program) {
      return;
    }

    // Expand the engine's `#exo-include` directives before handing the source
    // to the driver: the shared transform store's row -> texel mapping lives in
    // one place (`transformTextureLayout`) instead of being copied into every
    // shader that reads a node's transform.
    compiledVertexSource = resolveTransformTextureGlsl(shader.vertexSource);
    compiledFragmentSource = resolveTransformTextureGlsl(shader.fragmentSource);

    // Issue compile + link without querying status. The driver may
    // service these on a worker; we'll collect the result at first bind.
    vertexShader = compileShader(gl, gl.VERTEX_SHADER, compiledVertexSource);
    fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, compiledFragmentSource);
    program = linkProgram(gl, vertexShader, fragmentShader);

    pendingShader = shader;
  };

  const finalize = (): void => {
    if (pendingShader === null || program === null || vertexShader === null || fragmentShader === null) {
      return;
    }

    // With the KHR extension we can poll completion non-blockingly
    // before the actual status queries (which would otherwise block).
    // Without the extension we simply skip the poll and let the status
    // query block on its own (today's behaviour).
    if (parallelExt !== null) {
      void gl.getProgramParameter(program, completionStatus);
    }

    if (!gl.getShaderParameter(vertexShader, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(vertexShader);

      throw createCompileError('vertex', compiledVertexSource, log, label);
    }

    if (!gl.getShaderParameter(fragmentShader, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(fragmentShader);

      throw createCompileError('fragment', compiledFragmentSource, log, label);
    }

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(program);

      throw new RenderError({
        code: 'shader-link',
        backendType: RenderBackendType.WebGl2,
        message: `[ExoJS] ${label ?? 'shader'}: shader program failed to link.`,
        detail: log ?? '<no log>',
        ...(label !== undefined && { resource: label }),
      });
    }

    extractAttributes(gl, program, pendingShader);
    extractUniforms(gl, program, pendingShader, managedUniforms);
    extractUniformBlocks(gl, program, uniformBlocks);
    bindSchemaBlocks(gl, program, pendingShader.uniformBlockData, schemaBlocks);

    pendingShader = null;
  };

  // Indexed rather than `for...of`: this runs once per batch, so it is the one
  // loop every scene in the catalog walks - and the array iterators V8 does not
  // scalar-replace here are the only allocation left in a fully retained frame.
  const syncUniforms = (): void => {
    for (let i = 0; i < managedUniforms.length; i++) {
      const managed = managedUniforms[i]!;

      if (managed.uniform.dirty) {
        managed.uploadFn(gl, managed.location, managed.uniform.value);
        managed.uniform.markClean();
      }
    }

    for (let i = 0; i < uniformBlocks.length; i++) {
      uniformBlocks[i]!.upload();
    }

    // Binding points are re-established on every sync: they are context state
    // shared by every program, so the block another material bound to the same
    // point last draw would otherwise still be the one this draw reads.
    for (let i = 0; i < schemaBlocks.length; i++) {
      const binding = schemaBlocks[i]!;

      gl.bindBufferBase(gl.UNIFORM_BUFFER, binding.point, binding.buffer);

      if (binding.revision !== binding.data.revision) {
        gl.bufferSubData(gl.UNIFORM_BUFFER, 0, binding.data.float32);
        binding.revision = binding.data.revision;
      }
    }
  };

  return {
    initialize,
    bind: (shader: Shader): void => {
      initialize(shader);
      finalize();

      gl.useProgram(program);
      syncUniforms();
    },

    unbind: (): void => {
      gl.useProgram(null);
    },

    sync: (): void => {
      // Bind the program before syncing uniforms. WebGl2Backend
      // does not call bindShader() on the active renderer's shader
      // during normal draw flow, so sync() is the first entry point
      // that must establish program binding - otherwise uniform*
      // targets the wrong (or no) program and the subsequent draw
      // call fails with "no valid shader program in use".
      finalize();
      gl.useProgram(program);
      syncUniforms();
    },

    destroy: (shader: Shader): void => {
      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);
      gl.deleteProgram(program);

      for (const block of uniformBlocks) {
        block.destroy();
      }

      for (const binding of schemaBlocks) {
        gl.deleteBuffer(binding.buffer);
      }

      vertexShader = null;
      fragmentShader = null;
      program = null;
      pendingShader = null;
      managedUniforms.length = 0;
      uniformBlocks.length = 0;
      schemaBlocks.length = 0;

      shader.disconnect();
    },
  };
};

/** Build a structured shader-compile {@link RenderError} for one failed stage. */
const createCompileError = (stage: 'vertex' | 'fragment', source: string, log: string | null, label: string | undefined): RenderError =>
  new RenderError({
    code: 'shader-compile',
    backendType: RenderBackendType.WebGl2,
    message: `[ExoJS] ${label ?? 'shader'}: ${stage} shader failed to compile.`,
    detail: formatShaderError(source, log ?? '<no log>'),
    ...(label !== undefined && { resource: label }),
  });

// compileShader / linkProgram intentionally do NOT query COMPILE_STATUS or
// LINK_STATUS here - those queries block on driver completion. Status checks
// happen in finalize() at first bind, after the driver has had time to
// compile in the background (especially with KHR_parallel_shader_compile).

const compileShader = (gl: WebGL2RenderingContext, type: number, source: string): WebGLShader => {
  const shader = gl.createShader(type);

  if (!shader) {
    throw new Error('Could not create shader.');
  }

  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  return shader;
};

const linkProgram = (gl: WebGL2RenderingContext, vertexShader: WebGLShader, fragmentShader: WebGLShader): WebGLProgram => {
  const program = gl.createProgram();

  if (!program) {
    throw new Error('Could not create shader program.');
  }

  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);

  return program;
};

const extractAttributes = (gl: WebGL2RenderingContext, program: WebGLProgram, shader: Shader): void => {
  const activeAttributes = gl.getProgramParameter(program, gl.ACTIVE_ATTRIBUTES);

  for (let i = 0; i < activeAttributes; i++) {
    const info = gl.getActiveAttrib(program, i);

    if (!info) {
      continue;
    }

    const attribute = new ShaderAttribute(i, info.name, info.type);
    attribute.location = gl.getAttribLocation(program, info.name);
    shader.attributes.set(info.name, attribute);
  }
};

const extractUniforms = (gl: WebGL2RenderingContext, program: WebGLProgram, shader: Shader, managedUniforms: ManagedUniform[]): void => {
  const activeCount = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
  const activeIndices = new Uint8Array(activeCount).map((_, index) => index);
  const blocks = gl.getActiveUniforms(program, activeIndices, gl.UNIFORM_BLOCK_INDEX) as number[];
  const indices = activeIndices.filter(index => blocks[index] === -1);

  for (const index of indices) {
    const info = gl.getActiveUniform(program, index);

    if (!info) {
      continue;
    }

    const arrayConstructor = webGl2PrimitiveArrayConstructors[info.type];
    const byteSize = webGl2PrimitiveByteSizeMapping[info.type];
    const uploadFn = uniformUploadFunctions[info.type];

    if (arrayConstructor === undefined || byteSize === undefined || uploadFn === undefined) {
      throw new Error(`Unsupported uniform type ${info.type} for uniform "${info.name}".`);
    }

    const data = new arrayConstructor(byteSize * info.size);
    const uniform = new ShaderUniform(index, info.type, info.size, info.name, data);
    const location = gl.getUniformLocation(program, uniform.name);

    shader.uniforms.set(uniform.name, uniform);

    if (location) {
      managedUniforms.push({ location, uploadFn, uniform });
    }
  }
};

const extractUniformBlocks = (gl: WebGL2RenderingContext, program: WebGLProgram, uniformBlocks: WebGl2ShaderBlock[]): void => {
  const activeBlocks = gl.getProgramParameter(program, gl.ACTIVE_UNIFORM_BLOCKS);

  for (let index = 0; index < activeBlocks; index++) {
    // A block generated from a typed uniform schema is uploaded from the
    // schema's own std140 buffer, so reflecting it here would allocate a second
    // buffer and re-upload it on every sync for bytes nothing reads.
    if ((gl.getActiveUniformBlockName(program, index) ?? '').startsWith(generatedUniformBlockPrefix)) {
      continue;
    }

    const block = new WebGl2ShaderBlock(gl, program, index);
    uniformBlocks.push(block);
  }
};

/** One typed uniform block's GPU buffer and the revision it last received. */
interface SchemaBlockBinding {
  readonly data: UniformBlockData;
  readonly buffer: WebGLBuffer;
  /** Uniform-buffer binding point, which is the block's declaration index. */
  readonly point: number;
  revision: number;
}

/**
 * Give each declared block a buffer and a binding point on this program.
 *
 * A block the linker dropped - declared but never read by either stage - has no
 * index and is skipped: allocating for it would cost a buffer per material for
 * bytes the program cannot address.
 */
const bindSchemaBlocks = (gl: WebGL2RenderingContext, program: WebGLProgram, blocks: readonly UniformBlockData[], bindings: SchemaBlockBinding[]): void => {
  for (const [point, data] of blocks.entries()) {
    const index = gl.getUniformBlockIndex(program, data.layout.typeName);

    if (index === gl.INVALID_INDEX) {
      continue;
    }

    const buffer = gl.createBuffer();

    if (buffer === null) {
      throw new Error(`[ExoJS] could not create the uniform buffer for block ${data.layout.typeName}.`);
    }

    gl.uniformBlockBinding(program, index, point);
    gl.bindBuffer(gl.UNIFORM_BUFFER, buffer);
    gl.bufferData(gl.UNIFORM_BUFFER, data.byteLength, gl.DYNAMIC_DRAW);

    bindings.push({ data, buffer, point, revision: -1 });
  }
};
