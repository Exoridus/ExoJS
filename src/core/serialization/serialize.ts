import type { AssetConstructor } from '#assets/AssetConstructor';
import type { Loader } from '#assets/Loader';
import type { Component } from '#core/Component';
import { logger } from '#core/Logger';
import type { SceneNode } from '#core/SceneNode';
import type { Container } from '#rendering/Container';
import type { RenderNode } from '#rendering/RenderNode';

import { applyCommonFields, writeCommonFields } from './commonFields';
import { registerCoreSerializers } from './coreSerializers';
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

  _coreRegistered = true;
  registerCoreSerializers(defaultSerializationRegistry);
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

const createDeserializeContext = (loader: Loader | null, version: number, registry: SerializationRegistry): DeserializeContext => {
  const ctx: DeserializeContext = {
    version,
    loader,
    readNode: data => readNodeWith(data, ctx, registry),
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

const readNodeWith = (data: SerializedNode, ctx: DeserializeContext, registry: SerializationRegistry): SceneNode => {
  const entry = registry.resolveByName(data.type);

  if (entry === undefined) {
    throw new Error(`No serializer registered for type "${data.type}". Register one via registerSerializer().`);
  }

  const node = entry.serializer.read(data, ctx);

  applyCommonFields(node, data);

  return node;
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
 * must be pre-loaded into `loader`.
 * @internal
 */
export const deserializeTree = (
  data: SerializedNode,
  loader: Loader | null = null,
  registry: SerializationRegistry = defaultSerializationRegistry,
): SceneNode => {
  ensureCoreSerializers();

  return readNodeWith(data, createDeserializeContext(loader, SERIALIZATION_VERSION, registry), registry);
};

/**
 * Rebuild `container`'s contents from `data` in place: clears existing
 * children, applies `data`'s common fields to the container, then deserializes
 * and re-adds its children. Used by {@link Scene.deserialize} to reuse the
 * eagerly-created scene root.
 * @internal
 */
export const deserializeInto = (
  container: Container,
  data: SerializedNode,
  loader: Loader | null = null,
  registry: SerializationRegistry = defaultSerializationRegistry,
): void => {
  ensureCoreSerializers();

  const ctx = createDeserializeContext(loader, SERIALIZATION_VERSION, registry);

  container.removeChildren();
  applyCommonFields(container, data);

  const children = data.children;

  if (Array.isArray(children)) {
    for (const child of children) {
      const childNode = asSerializedNode(child);

      if (childNode !== null) {
        container.addChild(ctx.readNode(childNode) as RenderNode);
      }
    }
  }
};

/**
 * Validate and migrate a serialized scene document to the current
 * {@link SERIALIZATION_VERSION}, returning a structurally-sound
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
 * a `{ source, options }` object. A version 1 document is already valid
 * version 2 data, so its migration step is the identity. Future version bumps
 * register version→version+1 transforms here.
 * @internal
 */
export const migrate = (data: unknown): SerializedScene => {
  const scene = asObject(data);

  if (scene === null) {
    throw new Error('Cannot deserialize scene: the document is not an object.');
  }

  const version = typeof scene.version === 'number' ? scene.version : 0;

  if (version > SERIALIZATION_VERSION) {
    throw new Error(`Cannot deserialize scene: data version ${version} is newer than the supported version ${SERIALIZATION_VERSION}.`);
  }

  const root = asSerializedNode(scene.root);

  if (root === null) {
    throw new Error('Cannot deserialize scene: the document has no valid root node.');
  }

  const ui = asSerializedNode(scene.ui);

  return ui !== null ? { version, root, ui } : { version, root };
};

/**
 * Validate and migrate a serialized prefab document to the current
 * {@link SERIALIZATION_VERSION}, returning a structurally-sound
 * {@link SerializedPrefab}.
 *
 * The prefab counterpart to {@link migrate}, and the same untrusted boundary:
 * {@link Prefab.fromJSON} accepts whatever came off disk or the network. Throws
 * on a non-object document, a version newer than supported, or a missing/invalid
 * root.
 *
 * A version 1 document is valid version 2 data, exactly as for scenes; a
 * future version bump registers its version→version+1 transform in both places.
 * @internal
 */
export const migratePrefab = (data: unknown): SerializedPrefab => {
  const document = asObject(data);

  if (document === null) {
    throw new Error('Cannot deserialize prefab: the document is not an object.');
  }

  const version = typeof document.version === 'number' ? document.version : 0;

  if (version > SERIALIZATION_VERSION) {
    throw new Error(`Cannot deserialize prefab: data version ${version} is newer than the supported version ${SERIALIZATION_VERSION}.`);
  }

  const root = asSerializedNode(document.root);

  if (root === null) {
    throw new Error('Cannot deserialize prefab: the document has no valid root node.');
  }

  return { version, root };
};
