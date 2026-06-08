import { AbstractAssetFactory } from '#resources/AbstractAssetFactory';

/**
 * {@link AssetFactory} implementation that loads plain-text files (TXT, CSV,
 * GLSL shaders, HTML fragments, and any other UTF-8 text) and exposes them as
 * JavaScript strings.
 */
export class TextFactory extends AbstractAssetFactory<string> {
  public readonly storageName = 'text';

  /**
   * Reads the response body as a UTF-8 decoded string.
   */
  public async process(response: Response): Promise<string> {
    return response.text();
  }

  /**
   * Returns the decoded string unchanged.
   */
  public async create(source: string): Promise<string> {
    return source;
  }
}
