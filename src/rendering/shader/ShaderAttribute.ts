import { primitiveByteSizeMapping } from './ShaderMappings';

export class ShaderAttribute {

    public readonly index: number;
    public readonly name: string;
    public readonly type: number;
    public readonly size: number;
    public location = -1;

    public constructor(index: number, name: string, type: number) {
        this.index = index;
        this.name = name;
        this.type = type;
        this.size = primitiveByteSizeMapping[type];
    }

    public destroy(): void {
        // no-op — metadata only
    }
}
