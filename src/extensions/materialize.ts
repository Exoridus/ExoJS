import type { Application } from '#core/Application';
import type { SerializationRegistry } from '#core/serialization/SerializationRegistry';
import type { RenderBackend } from '#rendering/RenderBackend';
import type { DrawableConstructor } from '#rendering/Renderer';
import type { AssetConstructor } from '#resources/FactoryRegistry';
import type { Loader } from '#resources/Loader';

import type { ApplicationSystemBinding, AssetBinding, AssetHandler, RendererBinding, SerializerBinding } from './Extension';

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

    for (const name of binding.typeNames ?? []) {
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

    loader.bindAsset(
      {
        type: binding.type,
        ...(binding.typeNames !== undefined && { typeNames: binding.typeNames }),
        ...(binding.extensions !== undefined && { extensions: binding.extensions }),
        ...(binding.seamless !== undefined && { seamless: binding.seamless }),
      },
      handler,
    );
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

/**
 * Materialise all app-system bindings onto {@link Application.systems}.
 * Called once per Application, after every core manager already exists on
 * `app` — a binding's `create(app)` may safely read them. A binding
 * returning `undefined` opts out for this application and is skipped.
 * @internal
 */
export function materializeApplicationSystems(app: Application, bindings: readonly ApplicationSystemBinding[]): void {
  for (const binding of bindings) {
    const system = binding.create(app);

    if (system === undefined) continue;

    app.systems.add(system);
  }
}
