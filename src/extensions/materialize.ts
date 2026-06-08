import type { RenderBackend } from '@/rendering/RenderBackend';
import type { DrawableConstructor, Renderer } from '@/rendering/Renderer';
import type { AssetConstructor } from '@/resources/FactoryRegistry';
import type { Loader } from '@/resources/Loader';

import type { AssetBinding, AssetHandler, RendererBinding } from './Extension';

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

    backend.rendererRegistry.bindRenderer(binding.targets, renderer as Renderer<typeof backend, never>);
  }
}

/** Resolve the effective list of type names for a binding. */
function resolveTypeNames(binding: AssetBinding): readonly string[] {
  if (binding.typeNames !== undefined && binding.typeNames.length > 0) {
    return binding.typeNames;
  }

  return binding.typeName !== undefined ? [binding.typeName] : [];
}

/**
 * Materialise all asset bindings into the loader.
 * Called once per Application construction.
 * @internal
 */
export function materializeAssetBindings(loader: Loader, bindings: readonly AssetBinding[]): void {
  // --- Cross-binding pre-validation (no mutation yet) ---
  const seenTypes = new Set<AssetConstructor>();
  const seenNames = new Set<string>();
  const seenExts = new Set<string>();

  for (const binding of bindings) {
    if (seenTypes.has(binding.type) || loader.hasLoadable(binding.type)) {
      throw new Error(`An asset handler is already registered for ${binding.type.name}.`);
    }

    for (const name of resolveTypeNames(binding)) {
      if (seenNames.has(name) || loader.hasAssetType(name)) {
        throw new Error(`Asset type name "${name}" is already registered. Remove the conflicting binding.`);
      }

      seenNames.add(name);
    }

    for (const ext of binding.extensions ?? []) {
      const key = ext.replace(/^\./, '').toLowerCase();

      if (seenExts.has(key) || loader.hasExtension(key)) {
        throw new Error(`File extension ".${key}" is already mapped to an asset type. Remove the conflicting binding.`);
      }

      seenExts.add(key);
    }

    seenTypes.add(binding.type);
  }

  // --- Materialise: all pre-validation passed ---
  for (const binding of bindings) {
    const handler: AssetHandler = binding.create(loader);
    const names = resolveTypeNames(binding);

    loader.bindAsset({ type: binding.type, typeNames: names, extensions: binding.extensions }, handler);
  }
}
