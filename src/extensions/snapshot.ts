import type { ApplicationSystemBinding, AssetBinding, Extension, RendererBinding, SerializerBinding } from './Extension';

// @internal
export interface ExtensionSnapshot {
  readonly extensions: ReadonlyArray<Readonly<Extension>>;
  readonly renderers: readonly RendererBinding[];
  readonly assets: readonly AssetBinding[];
  readonly serializers: readonly SerializerBinding[];
  readonly systems: readonly ApplicationSystemBinding[];
}

// Shared empty singleton — zero allocation for extensions: [] selection.
const emptySnapshot: ExtensionSnapshot = Object.freeze({
  extensions: Object.freeze([]),
  renderers: Object.freeze([]),
  assets: Object.freeze([]),
  serializers: Object.freeze([]),
  systems: Object.freeze([]),
});

export { emptySnapshot as EMPTY_SNAPSHOT };

/**
 * Freeze an extension descriptor and its nested arrays in development builds.
 * Idempotent — safe to call on already-frozen descriptors.
 * Called from buildSnapshot (every visited extension) so global and local
 * descriptors receive consistent treatment.
 * @param ext — the descriptor to freeze
 * @internal
 */
export function freezeExtension(ext: Extension): void {
  if (!__DEV__) return;

  Object.freeze(ext);

  if (ext.dependencies) {
    // Only freeze the array — do not recursively mutate dependency descriptors.
    // Each dependency is frozen individually when visited during buildSnapshot.
    Object.freeze(ext.dependencies);
  }

  if (ext.renderers) {
    Object.freeze(ext.renderers);

    for (const binding of ext.renderers) {
      Object.freeze(binding);
      Object.freeze(binding.targets);
    }
  }

  if (ext.assets) {
    Object.freeze(ext.assets);

    for (const binding of ext.assets) {
      Object.freeze(binding);

      if (binding.extensions) {
        Object.freeze(binding.extensions);
      }

      if (binding.typeNames) {
        Object.freeze(binding.typeNames);
      }
    }
  }

  if (ext.serializers) {
    Object.freeze(ext.serializers);

    for (const binding of ext.serializers) {
      Object.freeze(binding);
    }
  }

  if (ext.systems) {
    Object.freeze(ext.systems);

    for (const binding of ext.systems) {
      Object.freeze(binding);
    }
  }
}

/**
 * Flatten an ordered extension list into a snapshot using stable depth-first
 * post-order traversal. Dependencies are materialised before their dependents.
 * De-duplicates same-object entries; throws on same-id/different-object or cycles.
 * Binding-level conflicts are checked per Application at materialisation time.
 * @internal
 */
export function buildSnapshot(input: readonly Extension[]): ExtensionSnapshot {
  if (input.length === 0) {
    return emptySnapshot;
  }

  const byId = new Map<string, Extension>();
  const visiting = new Set<Extension>();
  const visited = new Set<Extension>();
  const stack: Extension[] = [];
  const ordered: Extension[] = [];

  function visit(ext: Extension): void {
    // (1) Reserve ID + mismatch check FIRST — before dependency traversal.
    //     This catches nested same-id/different-object descriptors immediately.
    const existing = byId.get(ext.id);

    if (existing !== undefined && existing !== ext) {
      throw new Error(`Extension "${ext.id}" was provided by multiple descriptor objects.`);
    }

    if (existing === undefined) {
      byId.set(ext.id, ext);
    }

    // (2) Already fully processed — diamond / shared dependency.
    if (visited.has(ext)) return;

    // (3) Back-edge in current DFS stack — cycle.
    if (visiting.has(ext)) {
      const cyclePath = [...stack.slice(stack.indexOf(ext)), ext].map(e => e.id).join(' → ');
      throw new Error(`Extension dependency cycle detected: ${cyclePath}`);
    }

    // (4) Recurse into dependencies (post-order: deps before this extension).
    visiting.add(ext);
    stack.push(ext);

    for (const dep of ext.dependencies ?? []) {
      visit(dep);
    }

    stack.pop();
    visiting.delete(ext);

    // (5) Finalise — remove from in-progress, mark as fully processed, push to output.
    visited.add(ext);
    ordered.push(ext);

    // (6) Freeze descriptor consistently for global + local extensions.
    if (__DEV__) {
      freezeExtension(ext);
    }
  }

  for (const ext of input) visit(ext);

  // Flatten in topological (post-order) order — deps before dependents.
  const renderers: RendererBinding[] = [];
  const assets: AssetBinding[] = [];
  const serializers: SerializerBinding[] = [];
  const systems: ApplicationSystemBinding[] = [];

  for (const ext of ordered) {
    if (ext.renderers) {
      for (const binding of ext.renderers) {
        renderers.push(binding);
      }
    }

    if (ext.assets) {
      for (const binding of ext.assets) {
        assets.push(binding);
      }
    }

    if (ext.serializers) {
      for (const binding of ext.serializers) {
        serializers.push(binding);
      }
    }

    if (ext.systems) {
      for (const binding of ext.systems) {
        systems.push(binding);
      }
    }
  }

  return Object.freeze({
    extensions: Object.freeze(ordered),
    renderers: Object.freeze(renderers),
    assets: Object.freeze(assets),
    serializers: Object.freeze(serializers),
    systems: Object.freeze(systems),
  });
}
