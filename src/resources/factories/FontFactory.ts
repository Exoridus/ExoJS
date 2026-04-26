import { AbstractAssetFactory } from '@/resources/AbstractAssetFactory';

export interface FontFactoryOptions {
    family: string;
    descriptors?: FontFaceDescriptors;
    addToDocument?: boolean;
}

export class FontFactory extends AbstractAssetFactory<FontFace> {

    public readonly storageName = 'font';

    private readonly _addedFontFaces: Array<FontFace> = [];

    public async process(response: Response): Promise<ArrayBuffer> {
        return await response.arrayBuffer();
    }

    public async create(source: ArrayBuffer, options?: FontFactoryOptions): Promise<FontFace> {
        if (!options?.family) {
            throw new Error('FontFactory.create requires options with a "family" property.');
        }

        const { family, descriptors, addToDocument } = options;

        if (source.byteLength < 4) {
            throw new SyntaxError(`Invalid font data: expected at least 4 bytes, received ${source.byteLength}.`);
        }

        const fontFace = await new FontFace(family, source, descriptors).load().catch(() => {
            throw new SyntaxError(`Invalid font data in ArrayBuffer (${source.byteLength} bytes).`);
        });

        if (addToDocument !== false) {
            document.fonts.add(fontFace);
            this._addedFontFaces.push(fontFace);
        }

        return fontFace;
    }

    public override destroy(): void {
        for (const fontFace of this._addedFontFaces) {
            document.fonts.delete(fontFace);
        }
        this._addedFontFaces.length = 0;
        super.destroy();
    }
}
