import { AbstractResourceFactory } from "./AbstractResourceFactory";
import { StorageNames } from "const/core";

export class SVGFactory extends AbstractResourceFactory<string, HTMLImageElement> {

    public readonly storageName: StorageNames = StorageNames.Text;

    async process(response: Response): Promise<string> {
        return await response.text();
    }

    async create(source: string): Promise<HTMLImageElement> {
        const blob = new Blob([source], { type: 'image/svg+xml' });

        return new Promise((resolve, reject) => {
            const image = new Image();

            image.addEventListener('load', () => resolve(image));
            image.addEventListener('error', () => reject(Error('Error loading image source.')));
            image.addEventListener('abort', () => reject(Error('Image loading was canceled.')));

            image.src = this.createObjectURL(blob);
        });
    }
}
