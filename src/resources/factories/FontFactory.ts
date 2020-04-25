import { FontFaceDescriptors } from "css-font-loading-module";
import { AbstractResourceFactory } from "./AbstractResourceFactory";
import { StorageNames } from "types/types";

export interface FontFactoryOptions {
    family: string;
    descriptors?: FontFaceDescriptors;
    addToDocument?: boolean;
}

export class FontFactory extends AbstractResourceFactory<ArrayBuffer, FontFace> {

    public readonly storageName: StorageNames = StorageNames.Font;

    async process(response: Response): Promise<ArrayBuffer> {
        return await response.arrayBuffer();
    }

    async create(source: ArrayBuffer, options: FontFactoryOptions): Promise<FontFace> {
        const { family, descriptors, addToDocument } = options;
        const fontFace = await new FontFace(family, source, descriptors).load();

        if (addToDocument !== false) {
            document.fonts.add(fontFace);
        }

        return fontFace;
    }
}
