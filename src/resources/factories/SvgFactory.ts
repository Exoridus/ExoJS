import { AbstractAssetFactory } from '@/resources/AbstractAssetFactory';

export class SvgFactory extends AbstractAssetFactory<HTMLImageElement> {

    public readonly storageName = 'svg';

    public async process(response: Response): Promise<string> {
        return await response.text();
    }

    public async create(source: string): Promise<HTMLImageElement> {
        const blob = new Blob([source], { type: 'image/svg+xml' });
        const objectUrl = this.createObjectUrl(blob);

        return new Promise((resolve, reject) => {
            const image = new Image();
            const finalize = (): void => {
                this.revokeObjectUrl(objectUrl);
            };

            image.addEventListener('load', () => {
                finalize();
                resolve(image);
            }, { once: true });
            image.addEventListener('error', () => {
                finalize();
                reject(Error('Error loading image source.'));
            }, { once: true });
            image.addEventListener('abort', () => {
                finalize();
                reject(Error('Image loading was canceled.'));
            }, { once: true });

            image.src = objectUrl;
        });
    }
}
