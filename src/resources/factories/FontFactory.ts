import type { FontFaceDescriptors } from 'css-font-loading-module';
import { AbstractResourceFactory } from './AbstractResourceFactory';
import { StorageNames } from 'types/types';

export interface IFontFactoryOptions {
    family: string;
    descriptors?: FontFaceDescriptors;
    addToDocument?: boolean;
}

export class FontFactory extends AbstractResourceFactory<ArrayBuffer, FontFace> {

    public readonly storageName: StorageNames = StorageNames.font;

    public async process(response: Response): Promise<ArrayBuffer> {
        return await response.arrayBuffer();
    }

    public async create(source: ArrayBuffer, options: IFontFactoryOptions): Promise<FontFace> {
        const { family, descriptors, addToDocument } = options;

        if (source.byteLength < 4) {
            throw new SyntaxError(`Invalid font data: expected at least 4 bytes, received ${source.byteLength}.`);
        }

        let fontFace: FontFace | null = null;

        try {
            fontFace = await new FontFace(family, source, descriptors).load();
        } catch (error) {
            throw new SyntaxError(`Invalid font data in ArrayBuffer (${source.byteLength} bytes).`);
        }

        if (addToDocument !== false) {
            document.fonts.add(fontFace!);
        }

        return fontFace!;
    }
}
