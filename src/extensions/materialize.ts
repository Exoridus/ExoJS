import type { AssetConstructor } from '#assets/AssetConstructor';
import { AssetType } from '#assets/AssetType';
import { assetTypeBinding } from '#assets/assetTypeBinding';
import { normalizeExtension } from '#assets/extensionKindRegistry';
import type { Loader } from '#assets/Loader';
import type { SerializationRegistry } from '#core/serialization/SerializationRegistry';
import type { RenderBackend } from '#rendering/RenderBackend';
import type { DrawableConstructor } from '#rendering/Renderer';

import type { AssetBinding, AssetEntry, AssetHandler, RendererBinding, SerializerBinding } from './Extension';

/** A binding that may carry the stable identity an {@link AssetType} install supplies. */
type MaybeIdentifiedAssetBinding = AssetBinding & { readonly typeIdentity?: string };

/**
 * Materialise all renderer bindings into the backend's renderer registry.
 * Called once per backend from createBackend in Application.
 * @internal
 */
export function materializeRendererBindings(backend: RenderBackend, bindings: readonly RendererBinding[]): void {
  const seenTargets = new Set<DrawableConstructor>();

  for (const binding of bindings) {
    if (binding.targets.length === 0) {
      throw new Error('A RendererBinding must declare at least one target.');
    }

    for (const target of binding.targets) {
      if (seenTargets.has(target)) {
        throw new Error(`Two bindings target the same drawable type ${target.name}. Remove one of the conflicting bindings.`);
      }

      seenTargets.add(target);
    }

    const renderer = binding.create(backend);

    if (renderer === undefined) continue;

    backend.rendererRegistry.bindRenderer(binding.targets, renderer);
  }
}

/**
 * Materialise every asset entry into the loader.
 *
 * A first-class {@link AssetType} is adapted to a binding first, so both kinds
 * of entry are installed through one path and are checked against each other by
 * the same conflict rules - an `AssetType` claiming a suffix a binding already
 * owns is as loud as two bindings claiming it.
 *
 * Called once per Application construction. Each entry's factory/handler is
 * created here, which is what makes it loader-local: a descriptor shared between
 * applications never shares the mutable instance it describes.
 * @internal
 */
export function materializeAssetBindings(loader: Loader, entries: readonly AssetEntry[]): void {
  const bindings: AssetBinding[] = entries.map(entry => (entry instanceof AssetType ? assetTypeBinding(entry) : entry));

  assertNoBindingConflicts(loader, bindings);

  for (const binding of bindings) {
    const handler: AssetHandler = binding.create(loader);
    const { typeIdentity } = binding as MaybeIdentifiedAssetBinding;

    loader.bindAsset(
      {
        ctor: binding.ctor,
        ...(binding.type !== undefined && { type: binding.type }),
        ...(binding.typeNames !== undefined && { typeNames: binding.typeNames }),
        ...(binding.extensions !== undefined && { extensions: binding.extensions }),
        ...(binding.seamless !== undefined && { seamless: binding.seamless }),
        ...(binding.storageName !== undefined && { storageName: binding.storageName }),
        ...(typeIdentity !== undefined && { typeIdentity }),
      },
      handler,
    );
  }
}

/**
 * Reject every conflicting key across the whole list before anything is
 * installed, so a rejected list leaves the loader exactly as it was.
 *
 * The type-id check runs first: an id is the most specific thing a caller
 * chose, and reporting the constructor or type-name collision it also causes
 * would name a token the caller never wrote.
 */
function assertNoBindingConflicts(loader: Loader, bindings: readonly AssetBinding[]): void {
  const seenIdentities = new Set<string>();
  const seenTypes = new Set<AssetConstructor>();
  const seenNames = new Set<string>();
  const seenExts = new Set<string>();

  for (const binding of bindings) {
    const { typeIdentity } = binding as MaybeIdentifiedAssetBinding;

    if (typeIdentity !== undefined) {
      if (seenIdentities.has(typeIdentity) || loader.hasAssetType(typeIdentity)) {
        throw new Error(`Asset type id "${typeIdentity}" is already installed on this application. An id identifies exactly one type.`);
      }

      seenIdentities.add(typeIdentity);
    }

    if (seenTypes.has(binding.ctor) || loader.hasLoadable(binding.ctor)) {
      throw new Error(`An asset handler is already registered for ${binding.ctor.name}.`);
    }

    if (binding.seamless !== undefined && loader._hasSeamlessAdapter(binding.ctor)) {
      throw new Error(`A seamless adapter is already registered for ${binding.ctor.name}.`);
    }

    for (const name of binding.typeNames ?? []) {
      if (seenNames.has(name) || loader.hasAssetType(name)) {
        throw new Error(`Asset type name "${name}" is already registered. Remove the conflicting binding.`);
      }

      seenNames.add(name);
    }

    for (const ext of binding.extensions ?? []) {
      const key = normalizeExtension(ext);

      if (seenExts.has(key) || loader.hasExtension(key)) {
        throw new Error(`File extension ".${key}" is already mapped to an asset type. Remove the conflicting binding.`);
      }

      seenExts.add(key);
    }

    seenTypes.add(binding.ctor);
  }
}

/**
 * Materialise all serializer bindings into the scene serialization registry.
 * Called once per Application construction. A conflict (same type name bound to
 * a different constructor) throws via {@link SerializationRegistry.register}.
 * @internal
 */
export function materializeSerializerBindings(registry: SerializationRegistry, bindings: readonly SerializerBinding[]): void {
  for (const binding of bindings) {
    registry.register(binding.typeName, binding.target, binding.serializer);
  }
}
