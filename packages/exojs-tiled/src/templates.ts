import type { AssetFactoryContext } from '@codexo/exojs';
import { Asset } from '@codexo/exojs';

import type { TiledLayerData, TiledMapData, TiledObjectData, TiledPropertyData, TiledTemplateData } from './data';
import { maskTiledGid } from './gid';
import type { TiledLoadOptions } from './tiledOptions';
import { resolveTiledUrl } from './url';
import { TiledFormatError, validateTiledTemplateData } from './validate';

type TiledContext = AssetFactoryContext<TiledLoadOptions>;

/** A loaded template, with the location its relative references resolve against. */
interface LoadedTemplate {
  readonly url: string;
  readonly data: TiledTemplateData;
}

const loadTemplate = async (url: string, path: string, mapSource: string, context: TiledContext): Promise<LoadedTemplate> => {
  let text: string;

  try {
    text = await context.dependencies.load(Asset.type('text', url));
  } catch (error) {
    throw new TiledFormatError(mapSource, path, `object template "${url}" could not be loaded: ${String(error)}`);
  }

  // Tiled saves templates as XML (.tx) or JSON (.tj), whichever the author
  // picked; only the JSON form is readable here, and an XML file would
  // otherwise surface as an unhelpful JSON syntax error.
  if (text.trimStart().startsWith('<')) {
    throw new TiledFormatError(mapSource, path, `object template "${url}" is in Tiled's XML format; save it as a JSON template (.tj)`);
  }

  let raw: unknown;

  try {
    raw = JSON.parse(text);
  } catch (error) {
    throw new TiledFormatError(url, '', `not valid JSON: ${String(error)}`);
  }

  return { url, data: validateTiledTemplateData(raw, url) };
};

/** Properties merge by name: the instance's own override the template's, the rest are inherited. */
const mergeProperties = (
  inherited: readonly TiledPropertyData[] | undefined,
  own: readonly TiledPropertyData[] | undefined,
): readonly TiledPropertyData[] | undefined => {
  if (own === undefined || inherited === undefined) {
    return own ?? inherited;
  }

  const names = new Set(own.map(property => property.name));

  return [...inherited.filter(property => !names.has(property.name)), ...own];
};

/**
 * A template's `gid` counts from the first gid its own file assigns the
 * tileset; the instance needs it in the map's numbering for the same tileset.
 */
const remapTemplateGid = (gid: number, template: LoadedTemplate, map: TiledMapData, mapSource: string, path: string): number => {
  const tileset = template.data.tileset;

  if (tileset === undefined) {
    throw new TiledFormatError(template.url, 'object/gid', 'a tile template needs a "tileset" reference');
  }

  const tilesetUrl = resolveTiledUrl(tileset.source, template.url);
  const ref = map.tilesets.find(candidate => 'source' in candidate && resolveTiledUrl(candidate.source, mapSource) === tilesetUrl);

  if (ref === undefined) {
    throw new TiledFormatError(
      mapSource,
      path,
      `object template "${template.url}" uses tileset "${tilesetUrl}", which the map does not reference`,
    );
  }

  const flags = (gid >>> 0) - maskTiledGid(gid);

  return (ref.firstgid + maskTiledGid(gid) - tileset.firstgid + flags) >>> 0;
};

const instantiate = (
  instance: TiledObjectData,
  template: LoadedTemplate,
  map: TiledMapData,
  mapSource: string,
  path: string,
): TiledObjectData => {
  const own = new Set(instance.instanceFields);
  const base = template.data.object;
  const merged: Record<string, unknown> = { ...base };

  for (const field of own) {
    merged[field] = instance[field];
  }

  if (!own.has('gid') && base.gid !== undefined) {
    merged.gid = remapTemplateGid(base.gid, template, map, mapSource, path);
  }

  merged.properties = mergeProperties(base.properties, instance.properties);
  merged.id = instance.id;
  merged.x = instance.x;
  merged.y = instance.y;
  merged.template = instance.template;

  return merged as unknown as TiledObjectData;
};

/**
 * Returns `map` with every object placed from a template merged with that
 * template: the instance keeps its id, position and the fields it overrides,
 * inherits the rest, and merges properties by name. Each template file is
 * fetched once through the map's dependency scope and released with it.
 *
 * A map without templates is returned unchanged.
 *
 * @throws {@link TiledFormatError} for a template that cannot be loaded, is in
 *   Tiled's XML format, is malformed, or uses a tileset the map lacks.
 * @internal
 */
export const resolveTiledTemplates = async (map: TiledMapData, mapSource: string, context: TiledContext): Promise<TiledMapData> => {
  const pending = new Map<string, Promise<LoadedTemplate>>();
  const placements: Array<{ readonly object: TiledObjectData; readonly url: string; readonly path: string }> = [];

  const collect = (layers: readonly TiledLayerData[], path: string): void => {
    for (const [index, layer] of layers.entries()) {
      const layerPath = `${path}/${index}`;

      if (layer.type === 'group') {
        collect(layer.layers, `${layerPath}/layers`);
      } else if (layer.type === 'objectgroup') {
        for (const [objectIndex, object] of layer.objects.entries()) {
          if (object.template === undefined) {
            continue;
          }

          const url = resolveTiledUrl(object.template, mapSource);
          const objectPath = `${layerPath}/objects/${objectIndex}/template`;

          if (!pending.has(url)) {
            pending.set(url, loadTemplate(url, objectPath, mapSource, context));
          }

          placements.push({ object, url, path: objectPath });
        }
      }
    }
  };

  collect(map.layers, 'layers');

  if (placements.length === 0) {
    return map;
  }

  const loaded = await Promise.all(pending.values());
  const templates = new Map(loaded.map(template => [template.url, template]));

  const resolved = new Map<TiledObjectData, TiledObjectData>();

  for (const { object, url, path } of placements) {
    const template = templates.get(url);

    if (template !== undefined) {
      resolved.set(object, instantiate(object, template, map, mapSource, path));
    }
  }

  const rewrite = (layers: readonly TiledLayerData[]): TiledLayerData[] =>
    layers.map(layer => {
      if (layer.type === 'group') {
        return { ...layer, layers: rewrite(layer.layers) };
      }

      if (layer.type === 'objectgroup') {
        return { ...layer, objects: layer.objects.map(object => resolved.get(object) ?? object) };
      }

      return layer;
    });

  return { ...map, layers: rewrite(map.layers) };
};
