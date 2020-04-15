import { primitiveByteSizeMapping } from '../../const/rendering';

export class ShaderAttribute {

    private readonly _context: WebGL2RenderingContext;
    private readonly _program: WebGLProgram;
    public readonly location: number;
    public readonly index: number;
    public readonly name: string;
    public readonly type: number;
    public readonly size: number;

    constructor(gl: WebGL2RenderingContext, program: WebGLProgram, index: number) {
        const { name, type } = gl.getActiveAttrib(program, index)!; // todo - check if NNAO should be removed
        const location = gl.getAttribLocation(program, name);

        this._context = gl;
        this._program = program;
        this.location = location;
        this.index = index;
        this.name = name;
        this.type = type;
        this.size = primitiveByteSizeMapping[type];
    }

    destroy() {
        // todo - check if destroy is needed
    }
}
