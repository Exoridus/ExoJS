import type { Loader } from '#assets/Loader';
import type { SerializationRegistry } from '#core/serialization/SerializationRegistry';
import type { RenderBackend } from '#rendering/RenderBackend';
import type { DrawableConstructor } from '#rendering/Renderer';

import type { AssetEntry, RendererBinding, SerializerBinding } from './Extension';

/**
 * Materialise all renderer bindings into the backend's renderer registry.
 * Called once per backend from createBackend in Application.
 * @internal
 */
export const materializeRendererBindings = (backend: RenderBackend, bindings: readonly RendererBinding[]): void => {
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
};

/**
 * Install every asset type an application declares onto its loader.
 *
 * Called once per Application construction. Each type's factory is created
 * here, which is what makes it loader-local: a descriptor shared between
 * applications never shares the mutable instance it describes.
 * @internal
 */
export const materializeAssetTypes = (loader: Loader, entries: readonly AssetEntry[]): void => {
  loader._installAssetTypes(entries);
};

/**
 * Materialise all serializer bindings into the scene serialization registry.
 * Called once per Application construction. A conflict (same type name bound to
 * a different constructor) throws via {@link SerializationRegistry.register}.
 * @internal
 */
export const materializeSerializerBindings = (registry: SerializationRegistry, bindings: readonly SerializerBinding[]): void => {
  for (const binding of bindings) {
    registry.register(binding.typeName, binding.target, binding.serializer);
  }
};
