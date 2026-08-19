// Shader half of the consumer: three real shader files, imported as the source
// strings the engine's rendering APIs take.
import fragmentSource from './demo.frag';
import vertexSource from './demo.vert';
import wgslSource from './demo.wgsl';

export const glslProgram: { vertex: string; fragment: string } = { vertex: vertexSource, fragment: fragmentSource };

export const wgslModule: string = wgslSource;
