import type { AssetConstructor } from '#assets/AssetConstructor';
import type { Loader } from '#assets/Loader';
import type { Component } from '#core/Component';
import { logger } from '#core/Logger';
import type { SceneNode } from '#core/SceneNode';
import type { Container } from '#rendering/Container';
import type { RenderNode } from '#rendering/RenderNode';

import { applyCommonFields, writeCommonFields } from './commonFields';
import { registerCoreSerializers } from './coreSerializers';
import { destroyFailedRead } from './deserializeOwnership';
import type { DeserializeContext, SerializeContext } from './NodeSerializer';
import { asObject, asSerializedNode } from './read';
import { defaultSerializationRegistry, type SerializationRegistry } from './SerializationRegistry';
import { SERIALIZATION_VERSION, type SerializedNode, type SerializedPrefab, type SerializedScene, type SerializeOptions } from './types';

// Core serializers register lazily (not as an import side effect) so they
// survive `sideEffects: false` tree-shaking: the registration is reachable
// only through the framework entry points below, which a consumer must call.
let _coreRegistered = false;

/** Idempotently register the built-in node serializers on first use. @internal */
const ensureCoreSerializers = (): void => {
  if (_coreRegistered) {
    return;
  }

  registerCoreSerializers(defaultSerializationRegistry);
  _coreRegistered = true;
};

/**
 * Reset the process-wide serialization state so test suites do not leak
 * registrations into one another. Clears both module-level states: the
 * {@link defaultSerializationRegistry} **and** the `_coreRegistered` latch. Both
 * are mandatory - clearing the registry alone would leave the latch `true`, so
 * the core serializers would never re-register and later round-trips would fail
 * with spurious "No serializer registered" errors.
 *
 * Not exported from the public barrel; import via the direct module path in
 * tests.
 * @internal - For unit tests only.
 */
export const _resetDefaultSerializers = (): void => {
  _coreRegistered = false;
  defaultSerializationRegistry.clear();
};

const createSerializeContext = (loader: Loader | null, registry: SerializationRegistry): SerializeContext => {
  const ctx: SerializeContext = {
    version: SERIALIZATION_VERSION,
    loader,
    writeNode: node => writeNodeWith(node, ctx, registry),
    keyFor: resource => {
      if (resource === null || resource === undefined || typeof resource !== 'object' || loader === null) {
        return null;
      }

      const lookup = loader._assetReference(resource);

      if (lookup === null) {
        logger.warn(
          'An asset referenced by a node has no Loader key (runtime-created, or not loaded through the Loader). The reference is omitted from serialization.',
          {
            source: 'serialize',
            once: 'serialize:unkeyed-asset',
          },
        );

        return null;
      }

      if (lookup.kind === 'error') {
        throw new Error(`Cannot serialize an asset reference: ${lookup.message}`);
      }

      return lookup.options === undefined ? lookup.source : { source: lookup.source, options: lookup.options };
    },
  };

  return ctx;
};

const createDeserializeContext = (
  loader: Loader | null,
  version: number,
  registry: SerializationRegistry,
  provisional: SceneNode[],
): DeserializeContext => {
  const ctx: DeserializeContext = {
    version,
    loader,
    readNode: data => readNodeWith(data, ctx, registry, provisional),
    resolveAsset: <T>(reference: unknown, type: AssetConstructor<T>): T | null => {
      const request = readAssetReference(reference);

      if (request === null || loader === null) {
        return null;
      }

      const { source, options } = request;
      const resource = loader._peekResource(type, source, options) as T | null;

      if (resource === null) {
        logger.warn(
          `An asset referenced by a node was not pre-loaded into the Loader before deserialize (e.g. "${source}"); it resolves to null.`,
          {
            source: 'serialize',
            once: 'serialize:missing-asset',
          },
        );
      }

      return resource;
    },
  };

  return ctx;
};

/** The `(source, options)` request a stored reference names, or `null` for anything that is not one. */
const readAssetReference = (
  reference: unknown,
): { readonly source: string; readonly options?: Readonly<Record<string, unknown>> } | null => {
  if (typeof reference === 'string') {
    return { source: reference };
  }

  const value = asObject(reference);

  if (value === null || typeof value.source !== 'string') {
    return null;
  }

  const options = asObject(value.options);

  return options === null ? { source: value.source } : { source: value.source, options };
};

const writeNodeWith = (node: SceneNode, ctx: SerializeContext, registry: SerializationRegistry): SerializedNode => {
  const entry = registry.resolveByNode(node);

  if (entry === undefined) {
    throw new Error(`No serializer registered for node type "${node.constructor.name}". Register one via registerSerializer().`);
  }

  const out: SerializedNode = { type: entry.typeName };

  writeCommonFields(node, out);
  Object.assign(out, entry.serializer.write(node, ctx));

  return out;
};

const readNodeWith = (
  data: SerializedNode,
  ctx: DeserializeContext,
  registry: SerializationRegistry,
  provisional: SceneNode[],
): SceneNode => {
  const entry = registry.resolveByName(data.type);

  if (entry === undefined) {
    throw new Error(`No serializer registered for type "${data.type}". Register one via registerSerializer().`);
  }

  const checkpoint = provisional.length;

  try {
    const node = entry.serializer.read(data, ctx);

    provisional.push(node);
    applyCommonFields(node, data);

    return node;
  } catch (error) {
    // A custom serializer can catch a failed child read and return a fallback.
    // Roll back this call now without discarding its already-completed siblings.
    destroyProvisionalReads(provisional, checkpoint);

    throw error;
  }
};

const destroyProvisionalReads = (provisional: SceneNode[], checkpoint: number): void => {
  const failed = provisional.splice(checkpoint);

  // Parents are returned after their descendants. Destroy them first, then
  // release any completed reads that a failing custom serializer left unattached.
  for (let index = failed.length - 1; index >= 0; index--) {
    destroyFailedRead(failed[index]!);
  }
};

const readWithOwnership = <T>(
  loader: Loader | null,
  version: number,
  registry: SerializationRegistry,
  read: (ctx: DeserializeContext) => T,
): T => {
  const provisional: SceneNode[] = [];
  const ctx = createDeserializeContext(loader, version, registry, provisional);

  try {
    return read(ctx);
  } catch (error) {
    destroyProvisionalReads(provisional, 0);

    throw error;
  } finally {
    provisional.length = 0;
  }
};

const describeNode = (node: SceneNode): string => {
  const type = node.constructor.name || 'SceneNode';

  return node.name === null ? type : `${type} "${node.name}"`;
};

/** Refuse a tree carrying components, naming the first node and component class found. */
const rejectComponents = (root: SceneNode): void => {
  if (root._componentNodes === 0) {
    return;
  }

  const found: Component[] = [];

  root._forEachComponent(component => found.push(component));

  const first = found[0];

  if (first === undefined) {
    return;
  }

  const others = found.length > 1 ? ` (and ${found.length - 1} more component${found.length > 2 ? 's' : ''} in the tree)` : '';

  throw new Error(
    `Cannot serialize ${describeNode(root)}: ${describeNode(first.node)} carries a ${first.constructor.name || 'component'} component${others}, ` +
      'and components are not part of the serialized format. Remove them before serializing, or pass { omitComponents: true } to write the visual data alone.',
  );
};

/**
 * Serialize a single node and its subtree to a {@link SerializedNode}. Pass a
 * {@link Loader} so texture/asset references resolve to their source keys.
 * Throws for a tree carrying components unless `options.omitComponents` is set.
 * @internal
 */
export const serializeTree = (
  node: SceneNode,
  loader: Loader | null = null,
  registry: SerializationRegistry = defaultSerializationRegistry,
  options: SerializeOptions = {},
): SerializedNode => {
  ensureCoreSerializers();

  if (options.omitComponents !== true) {
    rejectComponents(node);
  }

  return writeNodeWith(node, createSerializeContext(loader, registry), registry);
};

/**
 * Reconstruct a node subtree from a {@link SerializedNode}. Referenced assets
 * must be pre-loaded into `loader`. When reading a versioned document, pass
 * its validated source version so nested custom serializers see the same schema.
 * @internal
 */
export const deserializeTree = (
  data: SerializedNode,
  loader: Loader | null = null,
  registry: SerializationRegistry = defaultSerializationRegistry,
  version: number = SERIALIZATION_VERSION,
): SceneNode => {
  ensureCoreSerializers();

  return readWithOwnership(loader, version, registry, ctx => ctx.readNode(data));
};

interface ContainerReadTarget {
  readonly container: Container | (() => Container);
  readonly data: SerializedNode;
}

const deserializeTargets = (
  targets: readonly ContainerReadTarget[],
  loader: Loader | null,
  registry: SerializationRegistry,
  version: number,
): void => {
  ensureCoreSerializers();

  const prepared = readWithOwnership(loader, version, registry, ctx => {
    const childrenByTarget = targets.map(({ data }) => {
      const nodes: RenderNode[] = [];

      if (Array.isArray(data.children)) {
        for (const child of data.children) {
          const childNode = asSerializedNode(child);

          if (childNode !== null) {
            nodes.push(ctx.readNode(childNode) as RenderNode);
          }
        }
      }

      return nodes;
    });

    // Lazy scene UI allocation happens only after every subtree has decoded.
    return targets.map(({ container, data }, index) => ({
      container: typeof container === 'function' ? container() : container,
      data,
      children: childrenByTarget[index]!,
    }));
  });

  for (const { container, data, children } of prepared) {
    container.removeChildren();
    applyCommonFields(container, data);

    for (const child of children) {
      container.addChild(child);
    }
  }
};

/**
 * Read all replacement children before changing `container`, then detach the
 * old children and apply the prepared contents. A read failure destroys the
 * provisional nodes and leaves the destination unchanged. The validated document
 * version is shared by every descendant read, including custom serializers.
 * @internal
 */
export const deserializeInto = (
  container: Container,
  data: SerializedNode,
  loader: Loader | null = null,
  registry: SerializationRegistry = defaultSerializationRegistry,
  version: number = SERIALIZATION_VERSION,
): void => {
  deserializeTargets([{ container, data }], loader, registry, version);
};

/** Prepare both scene trees before replacing either destination. @internal */
export const deserializeSceneInto = (
  root: Container,
  ui: () => Container,
  data: SerializedScene,
  loader: Loader | null = null,
  registry: SerializationRegistry = defaultSerializationRegistry,
): void => {
  const targets: ContainerReadTarget[] = [{ container: root, data: data.root }];

  if (data.ui !== undefined) {
    targets.push({ container: ui, data: data.ui });
  }

  deserializeTargets(targets, loader, registry, data.version);
};

const LAST_IDENTITY_COMPATIBLE_VERSION = 2;

/**
 * Reject a future version bump until its legacy-data transforms exist.
 * SDF outline/blur values cannot be reinterpreted as logical pixels:
 * unknown external MSDF ranges, saturated outlines and missing raster
 * densities have no general lossless conversion.
 */
const requireExplicitMigration = (version: number, kind: 'scene' | 'prefab'): void => {
  if (version < SERIALIZATION_VERSION && SERIALIZATION_VERSION > LAST_IDENTITY_COMPATIBLE_VERSION) {
    throw new Error(`Cannot deserialize ${kind}: version ${version} needs an explicit migration to version ${SERIALIZATION_VERSION}.`);
  }
};

/**
 * Validate a serialized scene document, retaining its source version until a
 * real migration can be applied, and return a structurally-sound
 * {@link SerializedScene}.
 *
 * This is the **untrusted top-level boundary**: the parameter is `unknown`
 * because a save file / cloud document is not guaranteed to match the type. The
 * frame (`version`/`root`/`ui`) is validated here so downstream `deserialize*`
 * paths can rely on `root` being a real node. Throws on a non-object document,
 * a version newer than supported, or a missing/invalid root; an invalid `ui` is
 * dropped (it is optional) rather than thrown.
 *
 * Version 2 widened asset references from a bare source string to also allow
 * a `{ source, options }` object. Versions 0/1 remain valid version 2 data,
 * so they need no conversion. Future versions must transform values before
 * any serializer reads them; stamping a new version alone is not migration.
 * @internal
 */
export const migrate = (data: unknown): SerializedScene => {
  const scene = asObject(data);

  if (scene === null) {
    throw new Error('Cannot deserialize scene: the document is not an object.');
  }

  const version: unknown = scene.version === undefined ? 0 : scene.version;

  // A fractional, negative or non-numeric version would skip every migration
  // step while still being published as the document's version.
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 0) {
    throw new Error(`Cannot deserialize scene: data version ${String(version)} is not a non-negative integer.`);
  }

  if (version > SERIALIZATION_VERSION) {
    throw new Error(`Cannot deserialize scene: data version ${version} is newer than the supported version ${SERIALIZATION_VERSION}.`);
  }

  requireExplicitMigration(version, 'scene');

  const root = asSerializedNode(scene.root);

  if (root === null) {
    throw new Error('Cannot deserialize scene: the document has no valid root node.');
  }

  const ui = asSerializedNode(scene.ui);

  return ui !== null ? { version, root, ui } : { version, root };
};

/**
 * Validate a serialized prefab document while retaining its source version,
 * returning a structurally-sound {@link SerializedPrefab}.
 *
 * The prefab counterpart to {@link migrate}, and the same untrusted boundary:
 * {@link Prefab.fromJSON} accepts whatever came off disk or the network. Throws
 * on a non-object document, a version newer than supported, or a missing/invalid
 * root.
 *
 * Versions 0/1 are identity-compatible with version 2, exactly as for scenes.
 * Future versions must migrate values before constructing nodes.
 * @internal
 */
export const migratePrefab = (data: unknown): SerializedPrefab => {
  const document = asObject(data);

  if (document === null) {
    throw new Error('Cannot deserialize prefab: the document is not an object.');
  }

  const version: unknown = document.version === undefined ? 0 : document.version;

  if (typeof version !== 'number' || !Number.isInteger(version) || version < 0) {
    throw new Error(`Cannot deserialize prefab: data version ${String(version)} is not a non-negative integer.`);
  }

  if (version > SERIALIZATION_VERSION) {
    throw new Error(`Cannot deserialize prefab: data version ${version} is newer than the supported version ${SERIALIZATION_VERSION}.`);
  }

  requireExplicitMigration(version, 'prefab');

  const root = asSerializedNode(document.root);

  if (root === null) {
    throw new Error('Cannot deserialize prefab: the document has no valid root node.');
  }

  return { version, root };
};
