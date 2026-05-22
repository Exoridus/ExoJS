import { AbstractAssetFactory } from '@/resources/AbstractAssetFactory';

/**
 * {@link AssetFactory} implementation that loads XML files and produces a
 * parsed {@link Document} via the browser's built-in {@link DOMParser}.
 *
 * Throws if the response body is not well-formed XML. Use the returned
 * `Document` directly with standard DOM APIs — `doc.querySelector`,
 * `doc.getElementsByTagName`, etc. — or pass it to a format-specific parser
 * (e.g. for Tiled TMX, BMFont, or TexturePacker XML atlas files).
 */
export class XmlFactory extends AbstractAssetFactory<Document> {
  public readonly storageName = 'xml';

  /**
   * Reads the response body as a UTF-8 string containing the raw XML markup.
   */
  public async process(response: Response): Promise<string> {
    return response.text();
  }

  /**
   * Parses the XML string into a {@link Document}.
   *
   * Throws if the browser's DOMParser reports a parse error (indicated by a
   * `<parsererror>` element in the returned document).
   */
  public async create(source: string): Promise<Document> {
    const doc = new DOMParser().parseFromString(source, 'text/xml');
    const parseError = doc.querySelector('parsererror');

    if (parseError) {
      throw new Error(`XML parse error: ${parseError.textContent?.trim() ?? 'unknown error'}`);
    }

    return doc;
  }
}
