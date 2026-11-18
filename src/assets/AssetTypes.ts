import type { CheckedHistory } from '#core/document/CheckedHistory';
import { DocumentHistory, type DocumentHistoryOptions } from '#core/document/DocumentHistory';
import type { DocumentParser } from '#core/document/DocumentParser';
import type { Migration } from '#core/document/Migration';
import type { Serializer } from '#core/serialization/Serializer';

import type { AssetConstructor } from './AssetConstructor';
import type { AssetFactory } from './AssetFactory';
import { type AssetSourceCodec, binarySourceCodec } from './AssetSourceCodec';
import { type AnyAssetType, type AssetLeaf, AssetType } from './AssetType';
import type { AssetTypeRegistry } from './AssetTypeRegistry';
import type { CacheLayout } from './cache/CacheLayout';
import { DocumentCodec } from './DocumentCodec';

/** An application-owned factory and the source representation it consumes. */
export interface AssetTypeDefinition<Resource, Source = ArrayBuffer, Options = undefined, Stored = Source> {
  readonly type: string;
  readonly loader: AssetFactory<Source, Resource, Options>;
  readonly extensions?: readonly string[];
  readonly codec?: AssetSourceCodec<NoInfer<Source>, Stored>;
  /** Increase its version if an updated codec changes the stored representation. */
  readonly layout?: CacheLayout<NoInfer<Stored>>;
  /** Writes the current document body when this asset has a persisted form. */
  readonly serializer?: Serializer<NoInfer<Resource>, NoInfer<Source> & object>;
}

type AnyMigration = Migration<never, unknown>;

/** An asset decoded from a versioned document before its factory runs. */
export interface DocumentAssetTypeDefinition<
  Resource,
  Document extends object,
  Options = undefined,
  Version extends number = 1,
  Min extends number = 1,
  Chain extends readonly AnyMigration[] = readonly [],
> extends Omit<AssetTypeDefinition<Resource, Document, Options, string>, 'codec' | 'loader'> {
  readonly codec?: never;
  readonly loader: AssetFactory<NoInfer<Document>, Resource, Options>;
  readonly parser: DocumentParser<Document>;
  readonly version?: Version;
  readonly minVersion?: Min;
  readonly migrations?: Chain;
}

interface NonDocumentDefinition {
  readonly parser?: never;
  readonly version?: never;
  readonly minVersion?: never;
  readonly migrations?: never;
}

// A settings array can contain unrelated resource, source, and option types.
/* eslint-disable @typescript-eslint/no-explicit-any */
type BinaryDefinition = AssetTypeDefinition<any, ArrayBuffer, any> & NonDocumentDefinition;
type CodecDefinition = AssetTypeDefinition<any, any, any, any> & NonDocumentDefinition & { readonly codec: AssetSourceCodec<any, any> };
type DocumentDefinition = DocumentAssetTypeDefinition<any, any, any, number, number, readonly AnyMigration[]>;
/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * A constructor and its factory for application startup. Startup arrays can
 * mix unrelated asset definitions. Their document history is validated at
 * registration. Use {@link AssetTypes.define} for per-definition type checking
 * of the constructor, factory, codec and migration chain.
 */
export type AssetTypeDefinitionEntry = readonly [AssetConstructor, BinaryDefinition | CodecDefinition | DocumentDefinition];

/** Asset type definitions on a single application. */
export class AssetTypes {
  private readonly _registry: AssetTypeRegistry;
  private _closed = false;

  /** @internal */
  public constructor(registry: AssetTypeRegistry) {
    this._registry = registry;
  }

  /**
   * Defines how the application loads a class. A parser enables migration
   * and validation of versioned documents. Without a parser or codec the
   * factory receives raw bytes. A type id is stable across releases and cannot
   * be shared with another class. Define the same class and id again before its
   * first request to replace its factory. Supply a separate factory instance
   * for each application, which owns and destroys it.
   */
  public define<
    Resource,
    Document extends object,
    Options = undefined,
    const Version extends number = 1,
    const Min extends number = 1,
    const Chain extends readonly AnyMigration[] = readonly [],
  >(
    target: AssetConstructor<Resource>,
    definition: DocumentAssetTypeDefinition<NoInfer<Resource>, Document, Options, Version, Min, Chain> &
      CheckedHistory<NoInfer<Document>, Version, Min, Chain>,
  ): void;
  public define<Resource, Options = undefined>(
    target: AssetConstructor<Resource>,
    definition: AssetTypeDefinition<NoInfer<Resource>, ArrayBuffer, Options> & NonDocumentDefinition,
  ): void;
  public define<Resource, Source, Options = undefined, Stored = Source>(
    target: AssetConstructor<Resource>,
    definition: AssetTypeDefinition<NoInfer<Resource>, Source, Options, Stored> &
      NonDocumentDefinition & {
        readonly codec: AssetSourceCodec<NoInfer<Source>, Stored>;
      },
  ): void;
  public define(...entry: AssetTypeDefinitionEntry): void {
    this._define(entry);
  }

  /** @internal */
  public _define([target, definition]: AssetTypeDefinitionEntry): void {
    if (this._closed) {
      throw new Error('Asset types cannot be defined after the application is destroyed.');
    }

    if (typeof target !== 'function' || typeof definition.loader.create !== 'function') {
      throw new TypeError('An asset definition requires a constructor and a loader with a create method.');
    }

    this._registry.define(new DefinedAssetType(target, definition, this._registry.getInstalled(target)?.type));
  }

  /** @internal */
  public _serializerFor<Value>(target: AssetConstructor<Value>): Serializer<Value, object> | undefined {
    const type = this._registry.getInstalled(target)?.type;

    return type instanceof DefinedAssetType ? type.serializer : undefined;
  }

  /** @internal */
  public _close(): void {
    this._closed = true;
  }
}

class DefinedAssetType extends AssetType<unknown, unknown, unknown, unknown> {
  public readonly id: string;
  declare public readonly _token: AssetConstructor;
  declare public readonly extensions: readonly string[];
  declare public readonly leaf: AssetLeaf<unknown>;
  declare public readonly codec: AssetSourceCodec<unknown, unknown>;
  declare public readonly layout: CacheLayout<unknown>;
  public readonly serializer: Serializer<unknown, object> | undefined;

  private readonly _factory: AssetFactory<unknown, unknown, unknown>;

  public constructor(target: AssetConstructor, definition: AssetTypeDefinitionEntry[1], previous: AnyAssetType | undefined) {
    super();
    this.id = definition.type;
    this._token = target;
    this.extensions = definition.extensions ?? previous?.extensions ?? [];
    this.leaf = previous?.leaf ?? 'ref';
    this.codec = definitionCodec(this.id, definition);
    this.serializer = definition.serializer;
    const layout = definition.layout ?? (previous?.codec === this.codec ? previous.layout : undefined);

    if (layout !== undefined) {
      this.layout = layout;
    }

    this._factory = definition.loader as AssetFactory<unknown, unknown, unknown>;

    if (previous?.resourceIdentity !== undefined) {
      this.resourceIdentity = previous.resourceIdentity.bind(previous);
    }

    if (previous?.sourceIdentity !== undefined) {
      this.sourceIdentity = previous.sourceIdentity.bind(previous);
    }

    if (previous?.persistedOptions !== undefined) {
      this.persistedOptions = previous.persistedOptions.bind(previous);
    }

    if (previous?.codec === this.codec && previous.unacquiredSource !== undefined) {
      this.unacquiredSource = previous.unacquiredSource.bind(previous);
    }
  }

  public createFactory(): AssetFactory<unknown, unknown, unknown> {
    return this._factory;
  }
}

type DefinitionSource = Partial<Omit<DocumentHistoryOptions<object>, 'id'>> & {
  readonly codec?: AssetSourceCodec<unknown, unknown>;
};

const definitionCodec = (
  id: string,
  { codec, parser, version, minVersion, migrations }: DefinitionSource,
): AssetSourceCodec<unknown, unknown> => {
  if (parser === undefined && version === undefined && minVersion === undefined && migrations === undefined) {
    return codec ?? binarySourceCodec;
  }

  if (codec !== undefined) {
    throw new TypeError(`Asset type "${id}" cannot specify both a codec and a document history.`);
  }

  if (typeof parser?.parse !== 'function') {
    throw new TypeError(`Asset type "${id}" requires a document parser for its version history.`);
  }

  return new DocumentCodec(
    new DocumentHistory({
      id,
      parser,
      ...(version !== undefined && { version }),
      ...(minVersion !== undefined && { minVersion }),
      ...(migrations !== undefined && { migrations }),
    }),
  );
};
