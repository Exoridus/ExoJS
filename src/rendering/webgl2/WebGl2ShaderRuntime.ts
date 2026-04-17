import type { Shader, ShaderRuntime } from '../shader/Shader';
import { ShaderAttribute } from '../shader/ShaderAttribute';
import { ShaderUniform } from '../shader/ShaderUniform';
import { WebGl2ShaderBlock } from './WebGl2ShaderBlock';
import { ShaderPrimitives } from 'rendering/types';
import { webGl2PrimitiveArrayConstructors, webGl2PrimitiveByteSizeMapping } from './WebGl2ShaderMappings';
import type { TypedArray } from 'core/types';

type UniformUploadFunction = (gl: WebGL2RenderingContext, location: WebGLUniformLocation, value: TypedArray) => void;

interface ManagedUniform {
    readonly location: WebGLUniformLocation;
    readonly uploadFn: UniformUploadFunction;
    readonly uniform: ShaderUniform;
}

const uniformUploadFunctions: Record<number, UniformUploadFunction> = {
    [ShaderPrimitives.Float]: (gl, location, value): void => { gl.uniform1f(location, value[0]); },
    [ShaderPrimitives.FloatVec2]: (gl, location, value): void => { gl.uniform2fv(location, value); },
    [ShaderPrimitives.FloatVec3]: (gl, location, value): void => { gl.uniform3fv(location, value); },
    [ShaderPrimitives.FloatVec4]: (gl, location, value): void => { gl.uniform4fv(location, value); },

    [ShaderPrimitives.Int]: (gl, location, value): void => { gl.uniform1i(location, value[0]); },
    [ShaderPrimitives.IntVec2]: (gl, location, value): void => { gl.uniform2iv(location, value); },
    [ShaderPrimitives.IntVec3]: (gl, location, value): void => { gl.uniform3iv(location, value); },
    [ShaderPrimitives.IntVec4]: (gl, location, value): void => { gl.uniform4iv(location, value); },

    [ShaderPrimitives.Bool]: (gl, location, value): void => { gl.uniform1i(location, value[0]); },
    [ShaderPrimitives.BoolVec2]: (gl, location, value): void => { gl.uniform2iv(location, value); },
    [ShaderPrimitives.BoolVec3]: (gl, location, value): void => { gl.uniform3iv(location, value); },
    [ShaderPrimitives.BoolVec4]: (gl, location, value): void => { gl.uniform4iv(location, value); },

    [ShaderPrimitives.FloatMat2]: (gl, location, value): void => { gl.uniformMatrix2fv(location, false, value); },
    [ShaderPrimitives.FloatMat3]: (gl, location, value): void => { gl.uniformMatrix3fv(location, false, value); },
    [ShaderPrimitives.FloatMat4]: (gl, location, value): void => { gl.uniformMatrix4fv(location, false, value); },

    [ShaderPrimitives.Sampler2D]: (gl, location, value): void => { gl.uniform1i(location, value[0]); },
};

export function createWebGl2ShaderRuntime(gl: WebGL2RenderingContext): ShaderRuntime {
    let program: WebGLProgram | null = null;
    let vertexShader: WebGLShader | null = null;
    let fragmentShader: WebGLShader | null = null;
    const managedUniforms: Array<ManagedUniform> = [];
    const uniformBlocks: Array<WebGl2ShaderBlock> = [];

    function initialize(shader: Shader): void {
        if (program) {
            return;
        }

        vertexShader = compileShader(gl, gl.VERTEX_SHADER, shader.vertexSource);
        fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, shader.fragmentSource);
        program = linkProgram(gl, vertexShader, fragmentShader);

        extractAttributes(gl, program, shader);
        extractUniforms(gl, program, shader, managedUniforms);
        extractUniformBlocks(gl, program, uniformBlocks);
    }

    function syncUniforms(): void {
        for (const managed of managedUniforms) {
            if (managed.uniform.dirty) {
                managed.uploadFn(gl, managed.location, managed.uniform.value);
                managed.uniform.markClean();
            }
        }

        for (const block of uniformBlocks) {
            block.upload();
        }
    }

    return {
        initialize,
        bind: (shader: Shader): void => {
            initialize(shader);

            gl.useProgram(program);
            syncUniforms();
        },

        unbind: (): void => {
            gl.useProgram(null);
        },

        sync: (): void => {
            syncUniforms();
        },

        destroy: (shader: Shader): void => {
            gl.deleteShader(vertexShader);
            gl.deleteShader(fragmentShader);
            gl.deleteProgram(program);

            for (const block of uniformBlocks) {
                block.destroy();
            }

            vertexShader = null;
            fragmentShader = null;
            program = null;
            managedUniforms.length = 0;
            uniformBlocks.length = 0;

            shader.disconnect();
        },
    };
}

function compileShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
    const shader = gl.createShader(type);

    if (!shader) {
        throw new Error('Could not create shader.');
    }

    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const log = gl.getShaderInfoLog(shader);
        gl.deleteShader(shader);
        throw new Error(`Shader compilation failed: ${log}`);
    }

    return shader;
}

function linkProgram(gl: WebGL2RenderingContext, vertexShader: WebGLShader, fragmentShader: WebGLShader): WebGLProgram {
    const program = gl.createProgram();

    if (!program) {
        throw new Error('Could not create shader program.');
    }

    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        const log = gl.getProgramInfoLog(program);
        gl.detachShader(program, vertexShader);
        gl.detachShader(program, fragmentShader);
        gl.deleteProgram(program);
        throw new Error(`Shader program linking failed: ${log}`);
    }

    return program;
}

function extractAttributes(gl: WebGL2RenderingContext, program: WebGLProgram, shader: Shader): void {
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
}

function extractUniforms(gl: WebGL2RenderingContext, program: WebGLProgram, shader: Shader, managedUniforms: Array<ManagedUniform>): void {
    const activeCount = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
    const activeIndices = new Uint8Array(activeCount).map((_, index) => index);
    const blocks = gl.getActiveUniforms(program, activeIndices, gl.UNIFORM_BLOCK_INDEX);
    const indices = activeIndices.filter((index) => (blocks[index] === -1));

    for (const index of indices) {
        const info = gl.getActiveUniform(program, index);

        if (!info) {
            continue;
        }

        const data = new webGl2PrimitiveArrayConstructors[info.type](webGl2PrimitiveByteSizeMapping[info.type] * info.size);
        const uniform = new ShaderUniform(index, info.type, info.size, info.name, data);
        const location = gl.getUniformLocation(program, uniform.name);
        const uploadFn = uniformUploadFunctions[info.type];

        shader.uniforms.set(uniform.name, uniform);

        if (location) {
            managedUniforms.push({ location, uploadFn, uniform });
        }
    }
}

function extractUniformBlocks(gl: WebGL2RenderingContext, program: WebGLProgram, uniformBlocks: Array<WebGl2ShaderBlock>): void {
    const activeBlocks = gl.getProgramParameter(program, gl.ACTIVE_UNIFORM_BLOCKS);

    for (let index = 0; index < activeBlocks; index++) {
        const block = new WebGl2ShaderBlock(gl, program, index);
        uniformBlocks.push(block);
    }
}
