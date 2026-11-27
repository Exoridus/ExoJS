import { describeDocumentValue } from '#core/document/documentErrors';
import type { DocumentHistory } from '#core/document/DocumentHistory';

import { AssetDecodeError } from './AssetDecodeError';
import type { AssetSourceCodec } from './AssetSourceCodec';

/**
 * {@link AssetSourceCodec} for an asset whose source file is a persisted,
 * versioned document (`{ "$type": ..., "$version": ..., ...body }`).
 *
 * The representation kept in a cache is the text exactly as it arrived, frame
 * and original version included. Migrations and validation run on every decode,
 * after the cache and before the factory, so shipping a newer document version
 * with new migrations reads records cached by an older release without a cache
 * miss and without a layout version bump.
 *
 * Any failure to read the document - malformed JSON, a foreign `$type`, a newer
 * or discontinued `$version`, a failing migration, a body the parser rejects -
 * is an {@link AssetDecodeError} naming the type, with the specific error as its
 * `cause`. A factory only ever sees a validated current-version body.
 *
 * @typeParam Document - the body type at the current version.
 *
 * @example
 * ```ts
 * class AtlasAssetType extends AssetType<AtlasDocument, Atlas, undefined, string> {
 *   public readonly id = 'atlas';
 *   public override readonly codec = new DocumentCodec(atlasHistory);
 *   // ...
 * }
 * ```
 * @advanced
 */
export class DocumentCodec<Document extends object> implements AssetSourceCodec<Document, string> {
  private readonly _history: DocumentHistory<Document>;

  public constructor(history: DocumentHistory<Document>) {
    this._history = history;
  }

  public fromResponse(response: Response): Promise<string> {
    return response.text();
  }

  public fromBytes(bytes: ArrayBuffer): Promise<string> {
    return Promise.resolve(new TextDecoder().decode(bytes));
  }

  public decode(stored: string): Promise<Document> {
    try {
      return Promise.resolve(this._history.read(JSON.parse(stored)));
    } catch (error) {
      let reason = describeDocumentValue(error);

      try {
        const message = error instanceof Error ? error.message : undefined;

        if (typeof message === 'string') {
          reason = message;
        }
      } catch {
        // An extension can throw a value whose prototype or message getter throws.
      }

      return Promise.reject(
        new AssetDecodeError({
          message: `Cannot read a "${this._history.id}" document: ${reason}`,
          assetType: this._history.id,
          cause: error,
        }),
      );
    }
  }
}
