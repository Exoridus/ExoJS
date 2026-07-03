import { logger } from '#core/logging';
import type { SceneNode } from '#core/SceneNode';
import type { Container } from '#rendering/Container';
import type { RenderNode } from '#rendering/RenderNode';
import type { AssetConstructor } from '#resources/FactoryRegistry';
import type { Loadable, Loader } from '#resources/Loader';

import { applyCommonFields, writeCommonFields } from './commonFields';
import { registerCoreSerializers } from './coreSerializers';
import type { DeserializeContext, SerializeContext } from './NodeSerializer';
import { asObject, asSerializedNode } from './read';
import { defaultSerializationRegistry, type SerializationRegistry } from './SerializationRegistry';
import { SERIALIZATION_VERSION, type SerializedNode, type SerializedScene } from './types';

// Core serializers register lazily (not as an import side effect) so they
// survive `sideEffects: false` tree-shaking: the registration is reachable
// only through the framework entry points below, which a consumer must call.
let _coreRegistered = false;

/** Idempotently register the built-in node serializers on first use. @internal */
function ensureCoreSerializers(): void {
  if (_coreRegistered) {
    return;
  }

  _coreRegistered = true;
  registerCoreSerializers(defaultSerializationRegistry);
}

/**
 * Reset the process-wide serialization state so test suites do not leak
 * registrations into one another. Clears both module-level states: the
 * {@link defaultSerializationRegistry} **and** the `_coreRegistered` latch. Both
 * are mandatory — clearing the registry alone would leave the latch `true`, so
 * the core serializers would never re-register and later round-trips would fail
 * with spurious "No serializer registered" errors.
 *
 * Not exported from the public barrel; import via the direct module path in
 * tests.
 * @internal — For unit tests only.
 */
export function _resetDefaultSerializers(): void {
  _coreRegistered = false;
  defaultSerializationRegistry.clear();
}

function createSerializeContext(loader: Loader | null, registry: SerializationRegistry): SerializeContext {
  const ctx: SerializeContext = {
    version: SERIALIZATION_VERSION,
    loader,
    writeNode: node => writeNodeWith(node, ctx, registry),
    keyFor: resource => {
      if (resource === null || resource === undefined || typeof resource !== 'object' || loader === null) {
        return null;
      }

      const key = loader.keyFor(resource);

      if (key === null) {
        logger.warn(
          'An asset referenced by a node has no Loader key (runtime-created, or not loaded through the Loader). The reference is omitted from serialization.',
          {
            source: 'serialize',
            once: 'serialize:unkeyed-asset',
          },
        );

        return null;
      }

      return key.source;
    },
  };

  return ctx;
}

function createDeserializeContext(loader: Loader | null, version: number, registry: SerializationRegistry): DeserializeContext {
  const ctx: DeserializeContext = {
    version,
    loader,
    readNode: data => readNodeWith(data, ctx, registry),
    resolveAsset: <T>(source: string | null | undefined, type: AssetConstructor<T>): T | null => {
      if (source === null || source === undefined || loader === null) {
        return null;
      }

      const resource = loader.peek(type as unknown as Loadable, source) as T | null;

      if (resource === null) {
        logger.warn(`An asset referenced by a node was not pre-loaded into the Loader before deserialize (e.g. "${source}"); it resolves to null.`, {
          source: 'serialize',
          once: 'serialize:missing-asset',
        });
      }

      return resource;
    },
  };

  return ctx;
}

function writeNodeWith(node: SceneNode, ctx: SerializeContext, registry: SerializationRegistry): SerializedNode {
  const entry = registry.resolveByNode(node);

  if (entry === undefined) {
    throw new Error(`No serializer registered for node type "${node.constructor.name}". Register one via registerSerializer().`);
  }

  const out: SerializedNode = { type: entry.typeName };

  writeCommonFields(node, out);
  Object.assign(out, entry.serializer.write(node, ctx));

  return out;
}

function readNodeWith(data: SerializedNode, ctx: DeserializeContext, registry: SerializationRegistry): SceneNode {
  const entry = registry.resolveByName(data.type);

  if (entry === undefined) {
    throw new Error(`No serializer registered for type "${data.type}". Register one via registerSerializer().`);
  }

  const node = entry.serializer.read(data, ctx);

  applyCommonFields(node, data);

  return node;
}

/**
 * Serialize a single node and its subtree to a {@link SerializedNode}. Pass a
 * {@link Loader} so texture/asset references resolve to their source keys.
 * @internal
 */
export function serializeTree(node: SceneNode, loader: Loader | null = null, registry: SerializationRegistry = defaultSerializationRegistry): SerializedNode {
  ensureCoreSerializers();

  return writeNodeWith(node, createSerializeContext(loader, registry), registry);
}

/**
 * Reconstruct a node subtree from a {@link SerializedNode}. Referenced assets
 * must be pre-loaded into `loader`.
 * @internal
 */
export function deserializeTree(data: SerializedNode, loader: Loader | null = null, registry: SerializationRegistry = defaultSerializationRegistry): SceneNode {
  ensureCoreSerializers();

  return readNodeWith(data, createDeserializeContext(loader, SERIALIZATION_VERSION, registry), registry);
}

/**
 * Rebuild `container`'s contents from `data` in place: clears existing
 * children, applies `data`'s common fields to the container, then deserializes
 * and re-adds its children. Used by {@link Scene.deserialize} to reuse the
 * eagerly-created scene root.
 * @internal
 */
export function deserializeInto(
  container: Container,
  data: SerializedNode,
  loader: Loader | null = null,
  registry: SerializationRegistry = defaultSerializationRegistry,
): void {
  ensureCoreSerializers();

  const ctx = createDeserializeContext(loader, SERIALIZATION_VERSION, registry);

  container.removeChildren();
  applyCommonFields(container, data);

  const children = data.children;

  if (Array.isArray(children)) {
    for (const child of children) {
      const childNode = asSerializedNode(child);
      if (childNode !== null) container.addChild(ctx.readNode(childNode) as RenderNode);
    }
  }
}

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
 * The migration chain is empty at v1; future version bumps register
 * version→version+1 transforms here.
 * @internal
 */
export function migrate(data: unknown): SerializedScene {
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
}
