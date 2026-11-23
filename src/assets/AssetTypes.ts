import type { CheckedHistory } from '#core/document/CheckedHistory';
import { DocumentHistory, type DocumentHistoryOptions } from '#core/document/DocumentHistory';
import type { DocumentParser } from '#core/document/DocumentParser';
import type { Migration } from '#core/document/Migration';
import type { Serializer } from '#core/serialization/Serializer';

import type { AssetConstructor } from './AssetConstructor';
import type { AssetFactory, AssetFactoryContext } from './AssetFactory';
import { type AssetSourceCodec, binarySourceCodec, blobSourceCodec, jsonSourceCodec, textSourceCodec } from './AssetSourceCodec';
import { type AnyAssetType, type AssetLeaf, AssetType } from './AssetType';
import type { AssetTypeRegistry } from './AssetTypeRegistry';
import type { CacheLayout } from './cache/CacheLayout';
import { DocumentCodec } from './DocumentCodec';

/**
 * Builds a resource from decoded source data. It may be synchronous or return
 * a promise; a throw or rejection fails the load with an `AssetDecodeError`.
 * Honour `context.signal` in long-running work: it aborts once no owner needs
 * the result any more.
 */
export type AssetDecode<Source, Resource, Options = undefined> = (
  source: Source,
  context: AssetFactoryContext<Options>,
) => Resource | PromiseLike<Resource>;

/**
 * How a definition builds its resources: a `decode` function, with an optional
 * `dispose` for resources that own something the garbage collector cannot
 * reclaim, or a full {@link AssetFactory} when the type needs per-application
 * state such as a worker.
 */
export type AssetFactorySpec<Resource, Source, Options = undefined> =
  | {
      readonly decode: AssetDecode<Source, Resource, Options>;
      /** Releases one evicted resource. Must be synchronous and tolerate a resource already released. */
      readonly dispose?: (resource: Resource) => void;
      readonly loader?: never;
    }
  | { readonly loader: AssetFactory<Source, Resource, Options>; readonly decode?: never; readonly dispose?: never };

/** How the raw response is read before `decode` runs, when no codec or document parser is given. */
export interface AssetReadKinds {
  /** Raw bytes, the default. */
  readonly arrayBuffer: ArrayBuffer;
  /** UTF-8 text. */
  readonly text: string;
  /** Parsed JSON. Validate it in `decode`, or use a document `parser`. */
  readonly json: unknown;
  /** A `Blob`, kept out of the JavaScript heap; suited to media and large binaries. */
  readonly blob: Blob;
}

interface AssetTypeDefinitionBase<Resource, Source, Stored> {
  readonly type: string;
  readonly extensions?: readonly string[];
  readonly codec?: AssetSourceCodec<NoInfer<Source>, Stored>;
  /** Increase its version if an updated codec changes the stored representation. */
  readonly layout?: CacheLayout<NoInfer<Stored>>;
  /** Writes the current document body when this asset has a persisted form. */
  readonly serializer?: Serializer<NoInfer<Resource>, NoInfer<Source> & object>;
}

/** An application-owned asset definition and the source representation it consumes. */
export type AssetTypeDefinition<Resource, Source = ArrayBuffer, Options = undefined, Stored = Source> = AssetTypeDefinitionBase<
  Resource,
  Source,
  Stored
> & {
  readonly read?: never;
} & AssetFactorySpec<Resource, Source, Options>;

/** A definition whose response is read as one of the {@link AssetReadKinds} before `decode` runs. */
export type ReadAssetTypeDefinition<Resource, Read extends keyof AssetReadKinds, Options = undefined> = Omit<
  AssetTypeDefinitionBase<Resource, AssetReadKinds[Read], AssetReadKinds[Read]>,
  'codec'
> & {
  readonly read: Read;
  readonly codec?: never;
} & AssetFactorySpec<Resource, AssetReadKinds[Read], Options>;

type AnyMigration = Migration<never, unknown>;

/** An asset decoded from a versioned document before its factory runs. */
export type DocumentAssetTypeDefinition<
  Resource,
  Document extends object,
  Options = undefined,
  Version extends number = 1,
  Min extends number = 1,
  Chain extends readonly AnyMigration[] = readonly [],
> = Omit<AssetTypeDefinitionBase<Resource, Document, string>, 'codec'> & {
  readonly codec?: never;
  readonly read?: never;
  readonly parser: DocumentParser<Document>;
  readonly version?: Version;
  readonly minVersion?: Min;
  readonly migrations?: Chain;
} & AssetFactorySpec<Resource, NoInfer<Document>, Options>;

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
type ReadDefinition = ReadAssetTypeDefinition<any, keyof AssetReadKinds, any> & NonDocumentDefinition;
type DocumentDefinition = DocumentAssetTypeDefinition<any, any, any, number, number, readonly AnyMigration[]>;
/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * A constructor and its factory for application startup. Startup arrays can
 * mix unrelated asset definitions. Their document history is validated at
 * registration. Use {@link AssetTypes.define} for per-definition type checking
 * of the constructor, factory, codec and migration chain.
 */
export type AssetTypeDefinitionEntry = readonly [
  AssetConstructor,
  BinaryDefinition | CodecDefinition | ReadDefinition | DocumentDefinition,
];

/** Asset type definitions on a single application. */
export class AssetTypes {
  private readonly _registry: AssetTypeRegistry;
  private _closed = false;

  /** @internal */
  public constructor(registry: AssetTypeRegistry) {
    this._registry = registry;
  }

  /**
   * Defines how the application loads a class.
   *
   * `decode` receives the fetched data and returns the resource, synchronously
   * or as a promise; fetching, caching, deduplication and ownership stay with
   * the loader. `read` chooses whether `decode` gets bytes (the default),
   * text, parsed JSON or a `Blob`. A document `parser` validates and migrates
   * versioned documents before `decode` runs, and a `codec` takes full control
   * of how the response is read. A `loader` factory replaces `decode` when the
   * type needs per-application state; supply a separate instance for each
   * application, which owns and destroys it.
   *
   * The `type` id names the type in caches and saved documents, so keep it
   * stable across releases; it cannot be shared with another class. Define the
   * same class and id again before its first request to replace its factory.
   *
   * @example
   * ```ts
   * app.assets.define(Level, { type: 'level', extensions: ['level'], decode: bytes => Level.parse(bytes) });
   * const level = await scene.assets.load('maps/intro.level');
   * ```
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
  public define<Resource, const Read extends keyof AssetReadKinds, Options = undefined>(
    target: AssetConstructor<Resource>,
    definition: ReadAssetTypeDefinition<NoInfer<Resource>, Read, Options> & NonDocumentDefinition,
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

    const { loader, decode } = definition as { loader?: { create?: unknown }; decode?: unknown };

    if (typeof target !== 'function' || (typeof decode === 'function') === (typeof loader?.create === 'function')) {
      throw new TypeError('An asset definition requires a constructor and either a decode function or a loader with a create method.');
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

    this._factory = factoryFor(definition);

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

const factoryFor = (definition: AssetTypeDefinitionEntry[1]): AssetFactory<unknown, unknown, unknown> => {
  if (definition.loader !== undefined) {
    return definition.loader as AssetFactory<unknown, unknown, unknown>;
  }

  const decode = definition.decode as AssetDecode<unknown, unknown, unknown>;
  const dispose = definition.dispose as ((resource: unknown) => void) | undefined;

  return {
    // Deferred so a synchronous throw becomes a rejection the loader reports as a decode failure.
    create: (source, context) => Promise.resolve().then(() => decode(source, context)),
    ...(dispose !== undefined && { dispose }),
  };
};

const readCodecs: { readonly [Read in keyof AssetReadKinds]: AssetSourceCodec<AssetReadKinds[Read], unknown> } = {
  arrayBuffer: binarySourceCodec,
  text: textSourceCodec,
  json: jsonSourceCodec,
  blob: blobSourceCodec,
};

type DefinitionSource = Partial<Omit<DocumentHistoryOptions<object>, 'id'>> & {
  readonly codec?: AssetSourceCodec<unknown, unknown>;
  readonly read?: keyof AssetReadKinds;
};

const definitionCodec = (
  id: string,
  { codec, read, parser, version, minVersion, migrations }: DefinitionSource,
): AssetSourceCodec<unknown, unknown> => {
  if (read !== undefined && !Object.hasOwn(readCodecs, read)) {
    throw new TypeError(`Asset type "${id}" has an unknown read kind "${String(read)}"; use one of ${Object.keys(readCodecs).join(', ')}.`);
  }

  if (parser === undefined && version === undefined && minVersion === undefined && migrations === undefined) {
    if (codec !== undefined && read !== undefined) {
      throw new TypeError(`Asset type "${id}" cannot specify both a codec and a read kind.`);
    }

    return codec ?? (read === undefined ? binarySourceCodec : readCodecs[read]);
  }

  if (codec !== undefined) {
    throw new TypeError(`Asset type "${id}" cannot specify both a codec and a document history.`);
  }

  if (read !== undefined) {
    throw new TypeError(`Asset type "${id}" cannot specify both a read kind and a document history.`);
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
