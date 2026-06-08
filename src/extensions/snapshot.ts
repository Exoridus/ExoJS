import type { AssetBinding, Extension, RendererBinding } from './Extension';

// @internal
export interface ExtensionSnapshot {
  readonly extensions: ReadonlyArray<Readonly<Extension>>;
  readonly renderers: readonly RendererBinding[];
  readonly assets: readonly AssetBinding[];
}

// Shared empty singleton — zero allocation for extensions: [] selection.
const emptySnapshot: ExtensionSnapshot = Object.freeze({
  extensions: Object.freeze([]),
  renderers: Object.freeze([]),
  assets: Object.freeze([]),
});

export { emptySnapshot as EMPTY_SNAPSHOT };

/**
 * Flatten an ordered extension list into a snapshot.
 * De-duplicates same-id/same-object entries; throws on same-id/different-object.
 * Binding-level conflicts are checked per Application at materialisation time.
 * @internal
 */
export function buildSnapshot(input: readonly Extension[]): ExtensionSnapshot {
  if (input.length === 0) {
    return emptySnapshot;
  }

  const seenById = new Map<string, Extension>();
  const extensions: Extension[] = [];
  const renderers: RendererBinding[] = [];
  const assets: AssetBinding[] = [];

  for (const ext of input) {
    const existing = seenById.get(ext.id);

    if (existing !== undefined) {
      if (existing === ext) continue;
      throw new Error(`Duplicate extension id "${ext.id}" with a different descriptor in the provided extensions list.`);
    }

    seenById.set(ext.id, ext);
    extensions.push(ext);

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
  }

  return Object.freeze({
    extensions: Object.freeze(extensions),
    renderers: Object.freeze(renderers),
    assets: Object.freeze(assets),
  });
}
