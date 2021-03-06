import { primitiveByteSizeMapping } from '../../types/rendering';

export class ShaderAttribute {

    private readonly _context: WebGL2RenderingContext;
    private readonly _program: WebGLProgram;
    public readonly location: number;
    public readonly index: number;
    public readonly name: string;
    public readonly type: number;
    public readonly size: number;

    public constructor(gl: WebGL2RenderingContext, program: WebGLProgram, index: number, name: string, type: number) {
        const location = gl.getAttribLocation(program, name);

        this._context = gl;
        this._program = program;
        this.location = location;
        this.index = index;
        this.name = name;
        this.type = type;
        this.size = primitiveByteSizeMapping[type];
    }

    public destroy(): void {
        // todo - check if destroy is needed
    }
}
