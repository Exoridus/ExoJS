import type { AssetConstructor } from '#assets/AssetConstructor';
import type { CatalogResourceLeaf, CatalogValueLeaf } from '#assets/assetMeta';
import { readAssetReference } from '#assets/AssetReference';
import type { Loader } from '#assets/Loader';
import type { LoaderScope } from '#assets/LoaderScope';
import { stableJson } from '#assets/portableData';
import type { Component } from '#core/Component';
import { logger } from '#core/Logger';
import type { SceneNode } from '#core/SceneNode';
import type { Container } from '#rendering/Container';
import type { RenderNode } from '#rendering/RenderNode';
import { Texture } from '#rendering/texture/Texture';

import { applyCommonFields, writeCommonFields } from './commonFields';
import { registerCoreSerializers } from './coreSerializers';
import { destroyFailedRead, releaseReadAssets, retainReadAssets } from './deserializeOwnership';
import { type LocalReferenceReader, type LocalReferenceWriter, readWithLocalReferences, writeWithLocalReferences } from './localReferences';
import type { DeserializeContext, SerializeContext } from './NodeSerializer';
import { asObject, asSerializedNode } from './read';
import { defaultSerializationRegistry, type SerializationRegistry } from './SerializationRegistry';
import {
  type DeserializeOptions,
  SERIALIZATION_VERSION,
  type SerializedNode,
  type SerializedPrefab,
  type SerializedScene,
  type SerializeOptions,
} from './types';

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

const createSerializeContext = (
  loader: Loader | null,
  registry: SerializationRegistry,
  locals: LocalReferenceWriter,
  options: SerializeOptions,
): SerializeContext => {
  const ctx: SerializeContext = {
    version: SERIALIZATION_VERSION,
    loader,
    writeNode: node => locals.embed(node, () => writeNodeWith(node, ctx, registry, locals, options)),
    local: value => locals.local(value),
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

      const { $type, source, options: requestOptions } = lookup;

      return requestOptions === undefined ? { $type, source } : { $type, source, options: requestOptions };
    },
  };

  return ctx;
};

interface PendingComponent {
  readonly node: SceneNode;
  readonly component: Component;
}

interface ReadState {
  readonly provisional: SceneNode[];
  readonly leases: Array<() => void>;
  readonly components: PendingComponent[];
  readonly references: Map<string, object>;
  readonly locals: LocalReferenceReader | null;
}

const createDeserializeContext = (
  loader: Loader | null,
  version: number,
  registry: SerializationRegistry,
  state: ReadState,
  policy: DeserializeOptions,
): DeserializeContext => {
  const { locals, references, leases } = state;
  const ctx: DeserializeContext = {
    version,
    loader,
    allowVideoSource: policy.allowVideoSource,
    readNode: data =>
      locals === null
        ? readNodeWith(data, ctx, registry, state)
        : locals.read(data, frame => {
            const node = asSerializedNode(frame);

            if (node === null) {
              throw new TypeError('Expected an embedded node with a type.');
            }

            return readNodeWith(node, ctx, registry, state);
          }),
    link: (reference, type, assign) => {
      if (locals === null) {
        throw new Error('Local references require scene format 3.');
      }

      locals.link(reference, type, assign);
    },
    resolveAsset: <T>(reference: unknown, type: AssetConstructor<T>): T | null => {
      const request = readAssetReference(reference);

      if (request === null || loader === null || ('$type' in request && !loader._matchesAssetType(type, request.$type))) {
        return null;
      }

      const { source, options } = request;
      const token: AssetConstructor = type;
      const sampler = token === Texture && options !== undefined ? asObject(options.textureOptions) : null;
      let resource: unknown;

      if (options !== undefined && sampler !== null && (Object.hasOwn(sampler, 'scaleMode') || Object.hasOwn(sampler, 'wrapMode'))) {
        const lease = loader._leaseTextureView(source, options);

        if (lease !== null) {
          leases.push(lease.release);
        }

        resource = lease?.texture ?? null;
      } else {
        resource = loader._peekResource(type, source, options);
      }

      if (resource === null) {
        logger.warn(
          `An asset referenced by a node was not pre-loaded into the Loader before deserialize (e.g. "${source}"); it resolves to null.`,
          {
            source: 'serialize',
            once: 'serialize:missing-asset',
          },
        );
      }

      return resource as T | null;
    },
    resolve: <T>(reference: unknown, type: AssetConstructor<T>): CatalogResourceLeaf<T> | CatalogValueLeaf<T> | null => {
      const request = readAssetReference(reference);

      if (request === null || loader === null) {
        return null;
      }

      const id = loader._referenceType(type, request.source, '$type' in request ? request.$type : undefined);
      const key = stableJson([id, request.source, request.options ?? null]);
      const previous = references.get(key);

      if (previous !== undefined) {
        return previous as CatalogResourceLeaf<T> | CatalogValueLeaf<T>;
      }

      const leaf = loader._createReferenceLeaf<T>(id, request.source, request.options);
      references.set(key, leaf);

      return leaf;
    },
  };

  return ctx;
};

const writeNodeWith = (
  node: SceneNode,
  ctx: SerializeContext,
  registry: SerializationRegistry,
  locals: LocalReferenceWriter,
  options: SerializeOptions,
): SerializedNode => {
  const entry = registry.resolveByNode(node);

  if (entry === undefined) {
    throw new Error(`No serializer registered for node type "${node.constructor.name}". Register one via registerSerializer().`);
  }

  const out: SerializedNode = { type: entry.typeName };

  writeCommonFields(node, out);
  const body = entry.serializer.write(node, ctx);

  if (Object.hasOwn(body, 'components')) {
    throw new Error('The framework owns the serialized "components" field.');
  }

  Object.assign(out, body);

  const components = options.omitComponents !== true ? node.components : [];

  if (components.length > 0) {
    out.components = components.map(component => {
      const registration = registry.components._forComponent(component);

      if (registration === undefined) {
        throw new Error(`No component serializer registered for ${component.constructor.name}.`);
      }

      return locals.embed(component, () => registration.write(component, ctx));
    });
  }

  return out;
};

const readNodeWith = (data: SerializedNode, ctx: DeserializeContext, registry: SerializationRegistry, state: ReadState): SceneNode => {
  const entry = registry.resolveByName(data.type);

  if (entry === undefined) {
    throw new Error(`No serializer registered for type "${data.type}". Register one via registerSerializer().`);
  }

  const { provisional, references, components, locals, leases } = state;
  const checkpoint = provisional.length;
  const componentCheckpoint = components.length;
  const referenceCheckpoint = references.size;
  const leaseCheckpoint = leases.length;

  try {
    const node = entry.serializer.read(data, ctx);

    provisional.push(node);
    applyCommonFields(node, data);

    if (locals !== null && Object.hasOwn(data, 'components')) {
      readNodeComponents(data.components, node, ctx, registry, locals, components);
    }

    if (leases.length > leaseCheckpoint) {
      retainReadAssets(node, leases.splice(leaseCheckpoint));
    }

    return node;
  } catch (error) {
    // A custom serializer can catch a failed child read and return a fallback.
    // Roll back this call now without discarding its already-completed siblings.
    destroyProvisionalReads(provisional, checkpoint);
    releaseReadAssets(leases.splice(leaseCheckpoint));
    destroyProvisionalComponents(components, componentCheckpoint);
    let index = 0;

    for (const key of references.keys()) {
      if (index++ >= referenceCheckpoint) {
        references.delete(key);
      }
    }

    throw error;
  }
};

const readNodeComponents = (
  input: unknown,
  node: SceneNode,
  ctx: DeserializeContext,
  registry: SerializationRegistry,
  locals: LocalReferenceReader,
  components: PendingComponent[],
): void => {
  if (!Array.isArray(input)) {
    throw new TypeError('The serialized "components" field must be an array.');
  }

  const seen = new Set<string>();

  for (const frame of input) {
    locals.read(frame, body => {
      const type = body.$type;

      if (typeof type !== 'string') {
        throw new TypeError('Expected a serialized component with a "$type" id.');
      }

      const entry = registry.components._forType(type);

      if (entry === undefined) {
        throw new Error(`No serializer registered for component type "${type}".`);
      }

      if (seen.has(type)) {
        throw new Error(`A node cannot carry two components of type "${type}".`);
      }

      seen.add(type);
      const component = entry.read(body, ctx);
      components.push({ node, component });

      return component;
    });
  }
};

const destroyProvisionalComponents = (components: PendingComponent[], checkpoint: number): void => {
  const failed = components.splice(checkpoint);

  for (let index = failed.length - 1; index >= 0; index--) {
    destroyFailedRead(failed[index]!.component);
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
  read: (ctx: DeserializeContext, locals: LocalReferenceReader | null) => () => T,
  options: DeserializeOptions = {},
  owner?: LoaderScope,
): T => {
  const provisional: SceneNode[] = [];
  const references = new Map<string, object>();
  const leases: Array<() => void> = [];
  const components: PendingComponent[] = [];
  const readProvisional = (locals: LocalReferenceReader | null): (() => T) =>
    read(createDeserializeContext(loader, version, registry, { provisional, references, components, locals, leases }, options), locals);

  try {
    const complete = version >= 3 ? readWithLocalReferences(readProvisional) : readProvisional(null);

    for (const { node, component } of components) {
      node.addComponent(component);
    }

    const result = complete();

    if (references.size > 0) {
      loader?._reserveReferenceLeaves(references, owner);
    }

    return result;
  } catch (error) {
    destroyProvisionalReads(provisional, 0);
    destroyProvisionalComponents(components, 0);

    throw error;
  } finally {
    provisional.length = 0;
    components.length = 0;
  }
};

const describeNode = (node: SceneNode): string => {
  const type = node.constructor.name || 'SceneNode';

  return node.name === null ? type : `${type} "${node.name}"`;
};

const rejectComponents = (root: SceneNode, registry: SerializationRegistry, inPlace = false): void => {
  if (root._componentNodes === 0) {
    return;
  }

  const found: Component[] = [];

  root._forEachComponent(component => {
    if (registry.components._forComponent(component) === undefined || (inPlace && component.node === root)) {
      found.push(component);
    }
  });

  const first = found[0];

  if (first === undefined) {
    return;
  }

  const others = found.length > 1 ? ` (and ${found.length - 1} more component${found.length > 2 ? 's' : ''} in the tree)` : '';

  throw new Error(
    `Cannot serialize ${describeNode(root)}: ${describeNode(first.node)} carries a ${first.constructor.name || 'component'} component${others} ` +
      'that cannot be restored here. Register the component, remove it, or pass { omitComponents: true } to write the visual data alone.',
  );
};

/**
 * Serialize a single node and its subtree to a {@link SerializedNode}. Pass a
 * {@link Loader} so texture/asset references resolve to their source keys.
 * Unregistered components are refused unless `options.omitComponents` is set.
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
    rejectComponents(node, registry);
  }

  return writeWithLocalReferences(locals => createSerializeContext(loader, registry, locals, options).writeNode(node));
};

/** Serialize both scene trees in one local-reference scope. @internal */
export const serializeSceneTrees = (
  root: Container,
  ui: Container | null,
  loader: Loader | null = null,
  registry: SerializationRegistry = defaultSerializationRegistry,
  options: SerializeOptions = {},
): SerializedScene => {
  ensureCoreSerializers();

  if (options.omitComponents !== true) {
    rejectComponents(root, registry, true);

    if (ui !== null) {
      rejectComponents(ui, registry, true);
    }
  }

  return writeWithLocalReferences(locals => {
    const ctx = createSerializeContext(loader, registry, locals, options);
    const data: SerializedScene = { version: SERIALIZATION_VERSION, root: ctx.writeNode(root) };

    if (ui !== null) {
      data.ui = ctx.writeNode(ui);
    }

    return data;
  });
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
  options: DeserializeOptions = {},
  owner?: LoaderScope,
): SceneNode => {
  ensureCoreSerializers();

  return readWithOwnership(
    loader,
    version,
    registry,
    ctx => {
      const node = ctx.readNode(data);

      return () => node;
    },
    options,
    owner,
  );
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
  options: DeserializeOptions,
  owner?: LoaderScope,
  publishUI?: () => void,
): void => {
  ensureCoreSerializers();

  const prepared = readWithOwnership(
    loader,
    version,
    registry,
    (ctx, locals) => {
      const childrenByTarget = targets.map(({ container, data }) => {
        if (locals !== null && Object.hasOwn(data, 'components')) {
          throw new Error('An existing scene root or UI container cannot carry embedded components.');
        }

        const nodes: RenderNode[] = [];

        const readChildren = (children: unknown): void => {
          if (Array.isArray(children)) {
            for (const child of children) {
              const childNode = asSerializedNode(child);

              if (childNode !== null) {
                nodes.push(ctx.readNode(childNode) as RenderNode);
              }
            }
          }
        };

        if (locals !== null && typeof container !== 'function') {
          // The caller owns structural anchors, including any unpublished UI candidate.
          locals.read(data, frame => {
            readChildren(frame.children);

            return container;
          });
        } else {
          if (locals !== null && (Object.hasOwn(data, '$id') || Object.hasOwn(data, '$ref'))) {
            throw new Error('A lazy scene UI container cannot carry local identity.');
          }

          readChildren(data.children);
        }

        return nodes;
      });

      // Resolve lazy UI only after the provisional tree has decoded and linked.
      return () =>
        targets.map(({ container, data }, index) => ({
          container: typeof container === 'function' ? container() : container,
          data,
          children: childrenByTarget[index]!,
        }));
    },
    options,
    owner,
  );

  publishUI?.();

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
  options: DeserializeOptions = {},
): void => {
  deserializeTargets([{ container, data }], loader, registry, version, options);
};

/** Prepare both scene trees before replacing either destination. @internal */
export const deserializeSceneInto = (
  root: Container,
  ui: Container | (() => Container),
  data: SerializedScene,
  loader: Loader | null = null,
  registry: SerializationRegistry = defaultSerializationRegistry,
  options: DeserializeOptions = {},
  owner?: LoaderScope,
  publishUI?: () => void,
): void => {
  const targets: ContainerReadTarget[] = [{ container: root, data: data.root }];

  if (data.ui !== undefined) {
    targets.push({ container: ui, data: data.ui });
  }

  deserializeTargets(targets, loader, registry, data.version, options, owner, publishUI);
};

/**
 * Newest version whose values every reader migrates. Raising
 * {@link SERIALIZATION_VERSION} past it without adding the matching reader
 * transforms fails here instead of misreading older documents.
 */
const LAST_MIGRATED_VERSION = 4;

const requireMigrationPath = (version: number, kind: 'scene' | 'prefab'): void => {
  if (version < SERIALIZATION_VERSION && SERIALIZATION_VERSION > LAST_MIGRATED_VERSION) {
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
 * Versions 0 through 3 differ in how asset references are framed; version 4
 * states text outline and shadow lengths in logical pixels. The document is
 * returned unchanged with its source version, and each node reader migrates
 * older values before constructing its node (`Text`, `BitmapText` and `Label`
 * convert the old distance-field thresholds). Future changes to existing
 * values need the same: a reader transform keyed on the source version.
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

  requireMigrationPath(version, 'scene');

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
 * Versions 0 through 3 migrate exactly as for scenes, in the node readers,
 * every time the prefab is instantiated; the stored document is not rewritten.
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

  requireMigrationPath(version, 'prefab');

  const root = asSerializedNode(document.root);

  if (root === null) {
    throw new Error('Cannot deserialize prefab: the document has no valid root node.');
  }

  return { version, root };
};
