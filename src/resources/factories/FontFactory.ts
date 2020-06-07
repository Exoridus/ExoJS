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
        const fontFace = await new FontFace(family, source, descriptors).load();

        if (addToDocument !== false) {
            document.fonts.add(fontFace);
        }

        return fontFace;
    }
}
