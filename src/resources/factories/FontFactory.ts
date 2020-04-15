import { FontFaceDescriptors } from "css-font-loading-module";
import { AbstractResourceFactory } from "./AbstractResourceFactory";
import { StorageNames } from "const/core";

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

    async create(source: ArrayBuffer, options: FontFactoryOptions) {
        const { family, descriptors, addToDocument } = options;
        const fontFace = await new FontFace(family, source, descriptors).load();

        if (addToDocument) {
            document.fonts.add(fontFace);
        }

        return fontFace;
    }
}
