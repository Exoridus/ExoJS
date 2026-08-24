import type { AssetTypeName } from './AssetDefinitions';
import type { AnyAssetType, AssetLeaf } from './AssetType';
import { normalizeExtension } from './extensions';
import { binaryType, csvType, jsonType, textType, wasmType, xmlType } from './types/dataTypes';
import { bmFontType, fontType } from './types/fontTypes';
import { imageType, svgType } from './types/imageTypes';
import { musicType, videoType } from './types/mediaTypes';
import { soundType } from './types/soundType';
import { subtitleType } from './types/subtitleType';
import { textureType } from './types/textureType';

/**
 * The asset types every {@link Application} installs.
 *
 * The set is fixed at build time and cannot be added to or replaced at runtime:
 * a type an application brings of its own is installed alongside these, on that
 * application only. Their ids are short rather than reverse-DNS because the
 * engine owns them, and because they double as the cache namespaces a
 * persistent store writes under.
 *
 * A type is listed unconditionally even where the browser API behind it may be
 * absent. Constructing the type touches nothing; only loading an asset of it
 * does, and a missing API should fail that load rather than silently make the
 * type unknown - which is what a conditional list did, leaving the type-level
 * suffix table claiming a type the runtime had never installed.
 */
export const coreAssetTypes: readonly AnyAssetType[] = Object.freeze([
  textureType,
  soundType,
  musicType,
  videoType,
  jsonType,
  textType,
  svgType,
  subtitleType,
  xmlType,
  csvType,
  binaryType,
  bmFontType,
  fontType,
  imageType,
  wasmType,
]);

const byId = new Map<string, AnyAssetType>(coreAssetTypes.map(type => [type.id, type]));

/**
 * Suffix to built-in type, for the types that can appear as a catalog leaf.
 *
 * A type whose leaf is `'none'` is deliberately absent: it has no placeholder
 * to hand out, so its assets have to be named explicitly rather than inferred
 * from a bare path.
 */
const byExtension = new Map<string, AssetTypeName>(
  coreAssetTypes.filter(type => type.leaf !== 'none').flatMap(type => type.extensions.map(extension => [normalizeExtension(extension), type.id])),
);

/** The built-in type a file suffix names, or `undefined`. @internal */
export function builtinTypeForExtension(extension: string): AssetTypeName | undefined {
  return byExtension.get(normalizeExtension(extension));
}

/**
 * The built-in type a whole path names, matching the basename's dot-suffixes
 * longest-first so `hero.atlas.json` tries `atlas.json` before `json`.
 * Query and fragment are ignored.
 * @internal
 */
export function builtinTypeForPath(path: string): AssetTypeName | undefined {
  const [withoutQueryHash = ''] = path.split(/[?#]/, 1);
  const basename = withoutQueryHash.split('/').pop() ?? '';
  const parts = basename.split('.');

  for (let i = 1; i < parts.length; i++) {
    const type = byExtension.get(parts.slice(i).join('.').toLowerCase());

    if (type !== undefined) {
      return type;
    }
  }

  return undefined;
}

/** What a built-in type hands out as a catalog leaf, or `undefined` for a name no built-in claims. @internal */
export function builtinLeaf(type: string): AssetLeaf<unknown> | undefined {
  return byId.get(type)?.leaf as AssetLeaf<unknown> | undefined;
}
