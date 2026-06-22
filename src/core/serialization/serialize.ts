import { warnOnce } from '#core/dev';
import type { SceneNode } from '#core/SceneNode';
import type { Container } from '#rendering/Container';
import type { RenderNode } from '#rendering/RenderNode';
import type { AssetConstructor } from '#resources/FactoryRegistry';
import type { Loadable, Loader } from '#resources/Loader';

import { applyCommonFields, writeCommonFields } from './commonFields';
import { registerCoreSerializers } from './coreSerializers';
import type { DeserializeContext, SerializeContext } from './NodeSerializer';
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
        warnOnce(
          'serialize:unkeyed-asset',
          'An asset referenced by a node has no Loader key (runtime-created, or not loaded through the Loader). The reference is omitted from serialization.',
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
        warnOnce(
          'serialize:missing-asset',
          `An asset referenced by a node was not pre-loaded into the Loader before deserialize (e.g. "${source}"); it resolves to null.`,
        );
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
      container.addChild(ctx.readNode(child as SerializedNode) as RenderNode);
    }
  }
}

/**
 * Validate and migrate a {@link SerializedScene} to the current
 * {@link SERIALIZATION_VERSION}. Throws if the data is newer than supported.
 * The migration chain is empty at v1; future version bumps register
 * version→version+1 transforms here.
 * @internal
 */
export function migrate(data: SerializedScene): SerializedScene {
  const version = typeof data.version === 'number' ? data.version : 0;

  if (version > SERIALIZATION_VERSION) {
    throw new Error(`Cannot deserialize scene: data version ${version} is newer than the supported version ${SERIALIZATION_VERSION}.`);
  }

  return data;
}
