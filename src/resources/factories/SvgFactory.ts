import { AbstractAssetFactory } from '@/resources/AbstractAssetFactory';

/**
 * {@link AssetFactory} implementation that loads SVG markup and produces a
 * rasterised {@link HTMLImageElement}.
 *
 * The SVG source text is wrapped in an `image/svg+xml` blob and decoded by the
 * browser's image pipeline, which means the result is a bitmap snapshot at the
 * element's intrinsic size rather than a live, interactive SVG DOM. Use this
 * when you need an SVG as a static sprite or texture source.
 */
export class SvgFactory extends AbstractAssetFactory<HTMLImageElement> {
  public readonly storageName = 'svg';

  /**
   * Reads the response body as UTF-8 text containing the raw SVG markup.
   */
  public async process(response: Response): Promise<string> {
    return response.text();
  }

  /**
   * Renders the SVG markup into a fully loaded {@link HTMLImageElement}.
   *
   * Creates a temporary `image/svg+xml` object URL, assigns it to an `<img>`
   * element, and revokes the URL once loading settles. Rejects on load error
   * or abort.
   */
  public async create(source: string): Promise<HTMLImageElement> {
    const blob = new Blob([source], { type: 'image/svg+xml' });
    const objectUrl = this.createObjectUrl(blob);

    return new Promise((resolve, reject) => {
      const image = new Image();
      const finalize = (): void => {
        this.revokeObjectUrl(objectUrl);
      };

      image.addEventListener(
        'load',
        () => {
          finalize();
          resolve(image);
        },
        { once: true },
      );
      image.addEventListener(
        'error',
        () => {
          finalize();
          reject(new Error('Error loading image source.'));
        },
        { once: true },
      );
      image.addEventListener(
        'abort',
        () => {
          finalize();
          reject(new Error('Image loading was canceled.'));
        },
        { once: true },
      );

      image.src = objectUrl;
    });
  }
}
