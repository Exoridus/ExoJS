import { Container } from '@codexo/exojs';
import { TextureRegion } from '@codexo/exojs';
import { type Texture } from '@codexo/exojs';
import { describe, expect, expectTypeOf, it, vi } from 'vitest';

import { ImageLayer, type ImageLayerOptions } from '../src/ImageLayer';
import { ImageLayerNode } from '../src/ImageLayerNode';
import { TileLayer } from '../src/TileLayer';
import { TileLayerNode } from '../src/TileLayerNode';
import { TileMap } from '../src/TileMap';
import { TileMapBand } from '../src/TileMapBand';
import type { TileLayerSelector, TileMapBandDefinition, TileMapViewOptions } from '../src/TileMapView';
import { TileMapView } from '../src/TileMapView';
import { TileSet } from '../src/TileSet';
import { TILE_TRANSFORM_IDENTITY } from '../src/types';

// ── helpers (conventions shared with nodes.test.ts) ────────────────────

function fakeTexture(width = 512, height = 512): Texture {
  return {
    width,
    height,
    flipY: false,
    uid: 0,
    label: 'test',
    destroy: vi.fn(),
    destroyed: false,
  } as unknown as Texture;
}

function makeTileset(name = 'tiles'): TileSet {
  return new TileSet({
    name,
    texture: new TextureRegion(fakeTexture(), { x: 0, y: 0, width: 512, height: 512 }),
    tileWidth: 32,
    tileHeight: 32,
    tileCount: 16,
  });
}

interface LayerOpts {
  readonly id?: number;
  readonly name?: string;
  readonly width?: number;
  readonly height?: number;
  readonly visible?: boolean;
  readonly opacity?: number;
  readonly offsetX?: number;
  readonly offsetY?: number;
}

function makeLayer(tileset: TileSet, opts: LayerOpts = {}): TileLayer {
  const layer = new TileLayer({
    id: opts.id ?? 1,
    name: opts.name ?? 'ground',
    width: opts.width ?? 4,
    height: opts.height ?? 4,
    tileWidth: 32,
    tileHeight: 32,
    tilesets: [tileset],
    visible: opts.visible,
    opacity: opts.opacity,
    offsetX: opts.offsetX,
    offsetY: opts.offsetY,
  });
  return layer;
}

function makeImageLayer(opts: Partial<ImageLayerOptions> = {}): ImageLayer {
  return new ImageLayer({
    id: opts.id ?? 100,
    image: opts.image ?? 'bg.png',
    texture: opts.texture === undefined ? fakeTexture() : opts.texture,
    ...opts,
  });
}

function fillLayer(layer: TileLayer, tileset: TileSet): TileLayer {
  for (let ty = 0; ty < layer.height; ty++) {
    for (let tx = 0; tx < layer.width; tx++) {
      layer.setTileAt(tx, ty, { tileset, localTileId: 0, transform: TILE_TRANSFORM_IDENTITY });
    }
  }
  return layer;
}

/** A 4×4 map with three filled layers: background (1), ground (2), roofs (3). */
function makeWorldMap(): { map: TileMap; tileset: TileSet } {
  const tileset = makeTileset();
  const map = new TileMap({
    name: 'world',
    width: 4,
    height: 4,
    tileWidth: 32,
    tileHeight: 32,
    tilesets: [tileset],
    layers: [
      fillLayer(makeLayer(tileset, { id: 1, name: 'background' }), tileset),
      fillLayer(makeLayer(tileset, { id: 2, name: 'ground' }), tileset),
      fillLayer(makeLayer(tileset, { id: 3, name: 'roofs' }), tileset),
    ],
  });
  return { map, tileset };
}

/**
 * A realistic composition: two bands parented under an application world root
 * with an app-owned actor container interleaved between them.
 */
function makeScene(): {
  map: TileMap;
  tileset: TileSet;
  view: TileMapView;
  worldRoot: Container;
  actors: Container;
  hero: Container;
} {
  const { map, tileset } = makeWorldMap();
  const view = map.createView({ bands: { ground: ['background', 'ground'], roof: ['roofs'] } });

  const worldRoot = new Container();
  const actors = new Container();
  const hero = new Container();

  actors.addChild(hero);
  worldRoot.addChild(view.band('ground'), actors, view.band('roof'));

  return { map, tileset, view, worldRoot, actors, hero };
}

// ═══════════════════════════════════════════════════════════════════════
// TileMapView — construction / default view
// ═══════════════════════════════════════════════════════════════════════

describe('TileMapView construction', () => {
  it('map.createView() and new TileMapView(map) both build a working view', () => {
    const { map } = makeWorldMap();

    for (const view of [map.createView(), new TileMapView(map)]) {
      expect(view.destroyed).toBe(false);
      expect(view.layers).toHaveLength(3);
      expect(view.layers[0]).toBeInstanceOf(TileLayerNode);
    }
  });

  it('createView() returns a fresh, independent view on every call', () => {
    const { map } = makeWorldMap();
    const first = map.createView();
    const second = map.createView();

    expect(second).not.toBe(first);
    expect(second.getLayerNodeById(1)).not.toBe(first.getLayerNodeById(1));
  });

  it('a default view has one node per map layer in document order and no bands', () => {
    const { map } = makeWorldMap();
    const view = map.createView();

    expect(view.layers.map(node => node.layer.name)).toEqual(['background', 'ground', 'roofs']);
    expect(view.layers.map(node => node.layer.id)).toEqual([1, 2, 3]);
    expect(view.bands).toHaveLength(0);
  });

  it('an empty map yields an empty view without throwing', () => {
    const map = new TileMap({ name: 'empty', width: 2, height: 2, tileWidth: 16, tileHeight: 16 });
    const view = map.createView();

    expect(view.layers).toHaveLength(0);
    expect(view.bands).toHaveLength(0);
  });

  it('view.map is the composed map instance (referenced, never owned)', () => {
    const { map } = makeWorldMap();

    expect(map.createView().map).toBe(map);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// TileMapView — direct layer-node access
// ═══════════════════════════════════════════════════════════════════════

describe('TileMapView direct layer-node access', () => {
  it('getLayerNodeById returns the canonical node for a layer id, or undefined', () => {
    const { map } = makeWorldMap();
    const view = map.createView();

    expect(view.getLayerNodeById(2)!.layer.id).toBe(2);
    expect(view.getLayerNodeById(2)).toBe(view.layers[1]);
    expect(view.getLayerNodeById(999)).toBeUndefined();
  });

  it('getLayerNodesByName returns every match in document order', () => {
    const tileset = makeTileset();
    const map = new TileMap({
      name: 'dup',
      width: 4,
      height: 4,
      tileWidth: 32,
      tileHeight: 32,
      tilesets: [tileset],
      layers: [
        makeLayer(tileset, { id: 1, name: 'decor' }),
        makeLayer(tileset, { id: 2, name: 'decor' }),
        makeLayer(tileset, { id: 3, name: 'solid' }),
      ],
    });
    const view = map.createView();

    const decor = view.getLayerNodesByName('decor');

    expect(decor).toHaveLength(2);
    expect(decor.map(node => node.layer.id)).toEqual([1, 2]);
    expect(view.getLayerNodesByName('solid')).toHaveLength(1);
    expect(view.getLayerNodesByName('missing')).toEqual([]);
  });

  it('view.layers stays in map document order even when bands select out of order', () => {
    const { map } = makeWorldMap();
    const view = map.createView({ bands: { stage: ['roofs', 'background'] } });

    expect(view.layers.map(node => node.layer.id)).toEqual([1, 2, 3]);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// TileMapView — bands
// ═══════════════════════════════════════════════════════════════════════

describe('TileMapView bands', () => {
  it('groups the canonical layer nodes into named bands in definition order', () => {
    const { map } = makeWorldMap();
    const view = map.createView({ bands: { ground: ['background', 'ground'], roof: ['roofs'] } });

    expect(view.bands.map(band => band.name)).toEqual(['ground', 'roof']);
    expect(view.hasBand('ground')).toBe(true);
    expect(view.hasBand('roof')).toBe(true);
    expect(view.hasBand('sky')).toBe(false);

    const ground = view.band('ground');

    expect(ground).toBeInstanceOf(TileMapBand);
    expect(ground).toBeInstanceOf(Container);
    expect(ground.name).toBe('ground');
    expect(ground.isEmpty).toBe(false);
    expect(ground.layerNodes).toHaveLength(2);
    expect(ground.layerNodes[0]).toBe(view.getLayerNodeById(1));
    expect(ground.layerNodes[1]).toBe(view.getLayerNodeById(2));
    expect(view.band('roof').layerNodes[0]).toBe(view.getLayerNodeById(3));
  });

  it('orders band members by map document order, not definition order', () => {
    const { map } = makeWorldMap();

    // Selectors listed in REVERSE document order, by name and by id.
    const byName = map.createView({ bands: { stage: ['ground', 'background'] } }).band('stage');
    const byId = map.createView({ bands: { stage: [2, 1] } }).band('stage');

    for (const band of [byName, byId]) {
      expect(band.layerNodes.map(node => node.layer.id)).toEqual([1, 2]);
      expect(band.children).toHaveLength(2);
      expect(band.children[0]).toBe(band.layerNodes[0]);
      expect(band.children[1]).toBe(band.layerNodes[1]);
    }
  });

  it('resolves selectors by layer id and by unique layer name in one definition', () => {
    const { map } = makeWorldMap();
    const band = map.createView({ bands: { mixed: [1, 'ground'] } }).band('mixed');

    expect(band.layerNodes.map(node => node.layer.id)).toEqual([1, 2]);
  });

  it('band.getLayerNodeById finds members by id', () => {
    const { map } = makeWorldMap();
    const view = map.createView({ bands: { ground: ['background', 'ground'] } });
    const band = view.band('ground');

    expect(band.getLayerNodeById(2)).toBe(view.getLayerNodeById(2));
    expect(band.getLayerNodeById(3)).toBeUndefined(); // roofs is not a member
  });

  it('allows an empty band', () => {
    const { map } = makeWorldMap();
    const view = map.createView({ bands: { empty: [] } });
    const band = view.band('empty');

    expect(view.hasBand('empty')).toBe(true);
    expect(band.isEmpty).toBe(true);
    expect(band.layerNodes).toHaveLength(0);
    expect(band.children).toHaveLength(0);
  });

  it('band() throws for an unknown band name, listing the defined bands', () => {
    const { map } = makeWorldMap();
    const view = map.createView({ bands: { ground: ['ground'] } });

    expect(() => view.band('missing')).toThrow(/no band named "missing"/);
    expect(() => view.band('missing')).toThrow(/"ground"/);
  });

  it('band() lists "(none)" when the view has no bands defined at all', () => {
    const { map } = makeWorldMap();
    const view = map.createView(); // no bands option

    expect(() => view.band('missing')).toThrow(/\(none\)/);
  });

  it('throws at construction for an unknown layer id', () => {
    const { map } = makeWorldMap();

    expect(() => map.createView({ bands: { b: [999] } })).toThrow(/no layer with id 999/);
  });

  it('throws at construction for an unknown layer name', () => {
    const { map } = makeWorldMap();

    expect(() => map.createView({ bands: { b: ['nope'] } })).toThrow(/no layer named "nope"/);
  });

  it('throws at construction for an ambiguous layer name', () => {
    const tileset = makeTileset();
    const map = new TileMap({
      name: 'dup',
      width: 4,
      height: 4,
      tileWidth: 32,
      tileHeight: 32,
      tilesets: [tileset],
      layers: [makeLayer(tileset, { id: 1, name: 'dup' }), makeLayer(tileset, { id: 2, name: 'dup' })],
    });

    expect(() => map.createView({ bands: { b: ['dup'] } })).toThrow(/ambiguous/);
    expect(() => map.createView({ bands: { b: ['dup'] } })).toThrow(/by id/);
  });

  it('throws at construction when a band lists the same layer twice', () => {
    const { map } = makeWorldMap();

    expect(() => map.createView({ bands: { b: [1, 1] } })).toThrow(/more than once/);
    // The same layer through different selector forms is still a duplicate.
    expect(() => map.createView({ bands: { b: ['ground', 2] } })).toThrow(/more than once/);
  });

  it('throws at construction when a layer is assigned to two bands', () => {
    const { map } = makeWorldMap();

    expect(() => map.createView({ bands: { a: [1], b: [1] } })).toThrow(/multiple bands/);
  });

  it('copies and freezes band definitions at construction', () => {
    const { map, tileset } = makeWorldMap();
    const stageDef: TileLayerSelector[] = [1];
    const defs: Record<string, TileMapBandDefinition> = { stage: stageDef };
    const view = map.createView({ bands: defs });

    // Mutating the caller's objects after construction changes nothing.
    stageDef.push(2);
    defs['late'] = [3];

    expect(view.band('stage').layerNodes.map(node => node.layer.id)).toEqual([1]);
    expect(view.hasBand('late')).toBe(false);

    // Even a refresh that creates a NEW node re-resolves from the frozen
    // internal copy ([1]) — not from the caller's mutated array ([1, 2]).
    map.removeLayer(2);
    view.refreshLayers();
    map.addLayer(makeLayer(tileset, { id: 2, name: 'ground' }));
    view.refreshLayers();

    expect(view.band('stage').layerNodes.map(node => node.layer.id)).toEqual([1]);
    expect(view.getLayerNodeById(2)).toBeDefined();
    expect(view.hasBand('late')).toBe(false);

    // Duplicate band NAMES cannot occur at all: `bands` is a record, and
    // record keys are unique by construction.
  });
});

// ═══════════════════════════════════════════════════════════════════════
// TileMapView — ownership & destruction
// ═══════════════════════════════════════════════════════════════════════

describe('TileMapView ownership & destruction', () => {
  it('view.destroy() destroys bands and layer nodes but never actors, map, layers, or textures', () => {
    const { map, tileset, view, worldRoot, actors, hero } = makeScene();
    const groundBand = view.band('ground');
    const roofBand = view.band('roof');
    const backgroundNode = view.getLayerNodeById(1)!;
    const roofNode = view.getLayerNodeById(3)!;

    expect(backgroundNode.chunkNodes).toHaveLength(1);

    view.destroy();

    // The view and its generated nodes are gone …
    expect(view.destroyed).toBe(true);
    expect(view.layers).toHaveLength(0);
    expect(view.bands).toHaveLength(0);
    expect(groundBand.layerNodes).toHaveLength(0);
    expect(backgroundNode.chunkNodes).toHaveLength(0);
    expect(backgroundNode.children).toHaveLength(0);
    expect(roofNode.chunkNodes).toHaveLength(0);

    // … the bands are detached from the application parent …
    expect(worldRoot.children).toHaveLength(1);
    expect(worldRoot.children[0]).toBe(actors);
    expect(worldRoot.children).not.toContain(groundBand);
    expect(worldRoot.children).not.toContain(roofBand);

    // … and application actors are untouched.
    expect(actors.parent).toBe(worldRoot);
    expect(hero.parent).toBe(actors);

    // The map, its layers, and Loader-owned textures all survive.
    expect(map.destroyed).toBe(false);
    expect(map.getTileLayer('ground')).toBeDefined();
    expect(map.layers[0].destroyed).toBe(false);
    expect(tileset.texture.texture.destroy).not.toHaveBeenCalled();
  });

  it('view.destroy() is idempotent', () => {
    const { view } = makeScene();

    view.destroy();

    expect(() => view.destroy()).not.toThrow();
    expect(view.destroyed).toBe(true);
  });

  it('band.destroy() is idempotent and safe before a later view.destroy()', () => {
    // Regression: TileMapBand had no destroyed guard, so a direct band.destroy()
    // followed by view.destroy() (which re-invokes band.destroy()) re-ran
    // Container.destroy() — itself not idempotent. The guard makes both safe.
    const { view, worldRoot, actors, hero } = makeScene();
    const groundBand = view.band('ground');

    groundBand.destroy();
    expect(groundBand.layerNodes).toHaveLength(0);
    expect(() => groundBand.destroy()).not.toThrow();

    // view.destroy() re-invokes band.destroy() on the already-destroyed band.
    expect(() => view.destroy()).not.toThrow();
    expect(view.destroyed).toBe(true);

    // Application actors are untouched throughout.
    expect(actors.parent).toBe(worldRoot);
    expect(hero.parent).toBe(actors);
  });

  it('destroying one band leaves the sibling band, actors, and map intact', () => {
    const { map, tileset, view, worldRoot, actors } = makeScene();
    const groundBand = view.band('ground');
    const roofBand = view.band('roof');
    const groundNode = view.getLayerNodeById(2)!;

    groundBand.destroy();

    // The destroyed band detached itself and freed its layer nodes.
    expect(worldRoot.children).not.toContain(groundBand);
    expect(groundBand.layerNodes).toHaveLength(0);
    expect(groundNode.chunkNodes).toHaveLength(0);

    // The sibling band and the actors are untouched.
    expect(worldRoot.children).toContain(roofBand);
    expect(roofBand.layerNodes).toHaveLength(1);
    expect(roofBand.layerNodes[0].chunkNodes).toHaveLength(1);
    expect(actors.parent).toBe(worldRoot);

    // The map, its layers, and textures survive.
    expect(map.destroyed).toBe(false);
    expect(map.getTileLayerById(2)!.destroyed).toBe(false);
    expect(tileset.texture.texture.destroy).not.toHaveBeenCalled();
  });

  it('destroying the application actor container leaves the tile bands intact', () => {
    const { view, worldRoot, actors } = makeScene();
    const groundBand = view.band('ground');
    const roofBand = view.band('roof');

    actors.destroy();

    expect(worldRoot.children).toContain(groundBand);
    expect(worldRoot.children).toContain(roofBand);
    expect(groundBand.layerNodes).toHaveLength(2);
    expect(groundBand.layerNodes[0].chunkNodes).toHaveLength(1);
    expect(roofBand.layerNodes).toHaveLength(1);
  });

  it('a band-less view detaches and destroys its direct layer nodes on destroy', () => {
    const { map } = makeWorldMap();
    const view = map.createView();
    const worldRoot = new Container();
    const actors = new Container();
    const background = view.getLayerNodeById(1)!;
    const roofs = view.getLayerNodeById(3)!;

    worldRoot.addChild(background, actors, roofs);

    view.destroy();

    expect(worldRoot.children).toHaveLength(1);
    expect(worldRoot.children[0]).toBe(actors);
    expect(background.parent).toBeNull();
    expect(background.chunkNodes).toHaveLength(0);
    expect(roofs.chunkNodes).toHaveLength(0);
  });

  it('does not own the map lifetime — the map survives view disposal', () => {
    const { map } = makeWorldMap();
    const view = map.createView();

    view.destroy();

    expect(map.destroyed).toBe(false);
    expect(map.getTileAt(2, 0, 0)).not.toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════
// TileMapView — refreshLayers
// ═══════════════════════════════════════════════════════════════════════

describe('TileMapView refreshLayers', () => {
  it('in-place tile edits need no refresh and never change node identity', () => {
    const { map, tileset } = makeWorldMap();
    const view = map.createView({ bands: { ground: ['background', 'ground'] } });
    const node = view.getLayerNodeById(2)!;

    // Write into an existing chunk — picked up via chunk revisions, no view API needed.
    map.getTileLayerById(2)!.setTileAt(0, 0, { tileset, localTileId: 1, transform: TILE_TRANSFORM_IDENTITY });

    expect(view.getLayerNodeById(2)).toBe(node);

    // A structural refresh with an unchanged layer set also keeps identity.
    expect(view.refreshLayers()).toBe(view);
    expect(view.getLayerNodeById(2)).toBe(node);
  });

  it('picks up an added layer as view-owned (unbanded) and keeps existing identities', () => {
    const { map, tileset, view, worldRoot, actors, hero } = makeScene();
    const groundBand = view.band('ground');
    const roofBand = view.band('roof');
    const before = [view.getLayerNodeById(1)!, view.getLayerNodeById(2)!, view.getLayerNodeById(3)!];

    map.addLayer(makeLayer(tileset, { id: 9, name: 'extra' }));
    view.refreshLayers();

    expect(view.layers.map(node => node.layer.id)).toEqual([1, 2, 3, 9]);
    expect(view.getLayerNodeById(1)).toBe(before[0]);
    expect(view.getLayerNodeById(2)).toBe(before[1]);
    expect(view.getLayerNodeById(3)).toBe(before[2]);

    const added = view.getLayerNodeById(9)!;

    // Not selected by any band: view-owned, unparented until the app places it.
    expect(added.parent).toBeNull();
    expect(groundBand.layerNodes).not.toContain(added);
    expect(roofBand.layerNodes).not.toContain(added);

    // Bands keep their placement; actors are untouched.
    expect(groundBand.parent).toBe(worldRoot);
    expect(roofBand.parent).toBe(worldRoot);
    expect(actors.parent).toBe(worldRoot);
    expect(hero.parent).toBe(actors);
  });

  it('assigns an added layer to a band when its id matches the definition', () => {
    const { map, tileset } = makeWorldMap();
    const view = map.createView({ bands: { stage: [1, 2] } });
    const band = view.band('stage');

    map.removeLayer(2);
    view.refreshLayers();

    expect(band.layerNodes.map(node => node.layer.id)).toEqual([1]);

    map.addLayer(makeLayer(tileset, { id: 2, name: 'reborn' }));
    view.refreshLayers();

    expect(band.layerNodes.map(node => node.layer.id)).toEqual([1, 2]);
    expect(band.getLayerNodeById(2)!.layer.name).toBe('reborn');
    expect(band.children[0]).toBe(band.getLayerNodeById(1));
    expect(band.children[1]).toBe(band.getLayerNodeById(2));
  });

  it('assigns an added layer to a band when its name matches unambiguously', () => {
    const { map, tileset } = makeWorldMap();
    const view = map.createView({ bands: { ground: ['background', 'ground'], roof: ['roofs'] } });
    const band = view.band('ground');
    const backgroundNode = view.getLayerNodeById(1)!;

    map.removeLayer(2);
    view.refreshLayers();
    map.addLayer(makeLayer(tileset, { id: 5, name: 'ground' }));
    view.refreshLayers();

    expect(view.layers.map(node => node.layer.id)).toEqual([1, 3, 5]);
    expect(band.layerNodes.map(node => node.layer.id)).toEqual([1, 5]);
    expect(band.getLayerNodeById(5)!.parent).toBe(band);
    expect(view.getLayerNodeById(1)).toBe(backgroundNode); // identity retained
  });

  it('does not band-assign an added layer whose name has become ambiguous', () => {
    const { map, tileset } = makeWorldMap();
    const view = map.createView({ bands: { ground: ['ground'] } });
    const band = view.band('ground');
    const original = view.getLayerNodeById(2)!;

    map.addLayer(makeLayer(tileset, { id: 9, name: 'ground' })); // second 'ground'
    view.refreshLayers();

    // The existing member stays; the new, ambiguous layer stays view-owned.
    expect(band.layerNodes).toHaveLength(1);
    expect(band.layerNodes[0]).toBe(original);
    expect(view.getLayerNodeById(9)!.parent).toBeNull();
  });

  it('drops removed layers, destroys their nodes, and keeps sibling identities', () => {
    const { map, view, worldRoot, actors, hero } = makeScene();
    const groundBand = view.band('ground');
    const backgroundNode = view.getLayerNodeById(1)!;
    const groundNode = view.getLayerNodeById(2)!;
    const roofNode = view.getLayerNodeById(3)!;

    map.removeLayer(2);
    view.refreshLayers();

    expect(view.layers.map(node => node.layer.id)).toEqual([1, 3]);
    expect(view.getLayerNodeById(2)).toBeUndefined();

    // The removed node was released from its band, detached, and destroyed.
    expect(groundBand.layerNodes).toHaveLength(1);
    expect(groundBand.layerNodes[0]).toBe(backgroundNode);
    expect(groundNode.parent).toBeNull();
    expect(groundNode.chunkNodes).toHaveLength(0);

    // Unchanged nodes keep identity; placement and actors are untouched.
    expect(view.getLayerNodeById(1)).toBe(backgroundNode);
    expect(view.getLayerNodeById(3)).toBe(roofNode);
    expect(groundBand.parent).toBe(worldRoot);
    expect(actors.parent).toBe(worldRoot);
    expect(hero.parent).toBe(actors);
  });

  it('never produces duplicate nodes across repeated refreshes', () => {
    const { map, tileset, view } = makeScene();

    view.refreshLayers().refreshLayers();
    map.addLayer(makeLayer(tileset, { id: 7, name: 'overlay' }));
    view.refreshLayers();
    view.refreshLayers();

    expect(view.layers).toHaveLength(map.layers.length);
    expect(new Set(view.layers).size).toBe(view.layers.length);
  });

  it('throws after the view was destroyed', () => {
    const { map } = makeWorldMap();
    const view = map.createView();

    view.destroy();

    expect(() => view.refreshLayers()).toThrow(/destroyed/);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// TileMapView — multiple maps
// ═══════════════════════════════════════════════════════════════════════

describe('TileMapView across multiple maps', () => {
  function makeStage(name: string): {
    map: TileMap;
    view: TileMapView;
    band: TileMapBand;
    worldRoot: Container;
  } {
    const tileset = makeTileset();
    const map = new TileMap({
      name,
      width: 4,
      height: 4,
      tileWidth: 32,
      tileHeight: 32,
      tilesets: [tileset],
      layers: [fillLayer(makeLayer(tileset, { id: 1, name: 'ground' }), tileset)],
    });
    const view = map.createView({ bands: { main: ['ground'] } });
    const worldRoot = new Container();

    worldRoot.addChild(view.band('main'));

    return { map, view, band: view.band('main'), worldRoot };
  }

  it('destroying one view leaves the other view intact', () => {
    const a = makeStage('a');
    const b = makeStage('b');

    a.view.destroy();

    expect(a.worldRoot.children).toHaveLength(0);
    expect(b.view.destroyed).toBe(false);
    expect(b.band.parent).toBe(b.worldRoot);
    expect(b.band.layerNodes).toHaveLength(1);
    expect(b.band.layerNodes[0].chunkNodes).toHaveLength(1);
    expect(b.map.destroyed).toBe(false);
  });

  it('overlapping layer ids across maps never cross-talk', () => {
    const a = makeStage('a');
    const b = makeStage('b');

    const nodeA = a.view.getLayerNodeById(1)!;
    const nodeB = b.view.getLayerNodeById(1)!;

    expect(nodeA).not.toBe(nodeB);
    expect(nodeA.layer).toBe(a.map.layers[0]);
    expect(nodeB.layer).toBe(b.map.layers[0]);
    expect(nodeA.layer).not.toBe(nodeB.layer);
  });

  it('band transforms are independent between views', () => {
    const a = makeStage('a');
    const b = makeStage('b');
    const { x: bX, y: bY } = b.band.getBounds();

    a.band.setPosition(40, 8);

    expect(a.band.getBounds().x).toBe(40);
    expect(a.band.getBounds().y).toBe(8);
    expect(b.band.x).toBe(0);
    expect(b.band.getBounds().x).toBe(bX);
    expect(b.band.getBounds().y).toBe(bY);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// TileMapView — image layer nodes
// ═══════════════════════════════════════════════════════════════════════

describe('TileMapView image layer nodes', () => {
  function makeImageMap(imageLayers: readonly ImageLayer[]): { map: TileMap; tileset: TileSet } {
    const tileset = makeTileset();
    const map = new TileMap({
      name: 'imaged',
      width: 4,
      height: 4,
      tileWidth: 32,
      tileHeight: 32,
      tilesets: [tileset],
      layers: [fillLayer(makeLayer(tileset, { id: 1, name: 'ground' }), tileset)],
      imageLayers,
    });

    return { map, tileset };
  }

  it('creates one ImageLayerNode per image layer, in insertion order', () => {
    const bg = makeImageLayer({ id: 10, name: 'bg' });
    const clouds = makeImageLayer({ id: 11, name: 'clouds' });
    const { map } = makeImageMap([bg, clouds]);
    const view = map.createView();

    expect(view.imageLayerNodes).toHaveLength(2);
    expect(view.imageLayerNodes[0]).toBeInstanceOf(ImageLayerNode);
    expect(view.imageLayerNodes.map(node => node.layer.id)).toEqual([10, 11]);
    expect(view.imageLayerNodes[0]!.layer).toBe(bg);
    expect(view.imageLayerNodes[1]!.layer).toBe(clouds);
  });

  it('an image-layer-less map yields an empty imageLayerNodes list', () => {
    const { map } = makeWorldMap();
    const view = map.createView();

    expect(view.imageLayerNodes).toEqual([]);
  });

  it('getImageLayerNodeById returns the canonical node for an image layer id, or undefined', () => {
    const bg = makeImageLayer({ id: 10, name: 'bg' });
    const { map } = makeImageMap([bg]);
    const view = map.createView();

    expect(view.getImageLayerNodeById(10)!.layer).toBe(bg);
    expect(view.getImageLayerNodeById(10)).toBe(view.imageLayerNodes[0]);
    expect(view.getImageLayerNodeById(999)).toBeUndefined();
  });

  it('getImageLayerNodeByName returns the node for a unique image layer name, or undefined', () => {
    const bg = makeImageLayer({ id: 10, name: 'bg' });
    const clouds = makeImageLayer({ id: 11, name: 'clouds' });
    const { map } = makeImageMap([bg, clouds]);
    const view = map.createView();

    expect(view.getImageLayerNodeByName('bg')!.layer).toBe(bg);
    expect(view.getImageLayerNodeByName('clouds')!.layer).toBe(clouds);
    expect(view.getImageLayerNodeByName('missing')).toBeUndefined();
  });

  it('getImageLayerNodeByName throws for an ambiguous (duplicate) image layer name', () => {
    const a = makeImageLayer({ id: 10, name: 'dup' });
    const b = makeImageLayer({ id: 11, name: 'dup' });
    const { map } = makeImageMap([a, b]);
    const view = map.createView();

    expect(() => view.getImageLayerNodeByName('dup')).toThrow(/ambiguous/);
    expect(() => view.getImageLayerNodeByName('dup')).toThrow(/by id/);
  });

  it('destroy() destroys image layer nodes and detaches them from an application parent', () => {
    const bg = makeImageLayer({ id: 10, name: 'bg' });
    const { map } = makeImageMap([bg]);
    const view = map.createView();
    const worldRoot = new Container();
    const node = view.getImageLayerNodeById(10)!;

    worldRoot.addChild(node);
    view.destroy();

    expect(node.destroyed).toBe(true);
    expect(node.parent).toBeNull();
    expect(worldRoot.children).toHaveLength(0);
    expect(view.imageLayerNodes).toHaveLength(0);
  });

  it('pixelSnapMode cascades to image layer nodes', () => {
    const bg = makeImageLayer({ id: 10, name: 'bg' });
    const { map } = makeImageMap([bg]);
    const view = map.createView();
    const node = view.getImageLayerNodeById(10)!;

    expect(node.pixelSnapMode).toBe('none');

    view.pixelSnapMode = 'geometry';

    expect(node.pixelSnapMode).toBe('geometry');
  });

  it('band definitions still reject image-layer ids and names as unknown selectors', () => {
    const bg = makeImageLayer({ id: 10, name: 'bg' });
    const { map } = makeImageMap([bg]);

    expect(() => map.createView({ bands: { b: [10] } })).toThrow(/no layer with id 10/);
    expect(() => map.createView({ bands: { b: ['bg'] } })).toThrow(/no layer named "bg"/);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// TileMapBand — transform
// ═══════════════════════════════════════════════════════════════════════

describe('TileMapBand transform', () => {
  function makeTransformScene(): {
    view: TileMapView;
    band: TileMapBand;
    node: TileLayerNode;
    worldRoot: Container;
    actors: Container;
  } {
    const tileset = makeTileset();
    const map = new TileMap({
      name: 'm',
      width: 4,
      height: 4,
      tileWidth: 32,
      tileHeight: 32,
      tilesets: [tileset],
      layers: [makeLayer(tileset, { id: 1, name: 'ground' })],
    });
    const view = map.createView({ bands: { main: ['ground'] } });
    const band = view.band('main');
    const worldRoot = new Container();
    const actors = new Container();

    worldRoot.addChild(band, actors);

    return { view, band, node: view.getLayerNodeById(1)!, worldRoot, actors };
  }

  it('translating a band moves its tile-layer subtree in world space', () => {
    const { band, node } = makeTransformScene();
    const { x, y, width, height } = node.getBounds();

    expect([x, y, width, height]).toEqual([0, 0, 128, 128]);

    band.setPosition(10, 20);

    const moved = node.getBounds();

    expect(moved.x).toBe(10);
    expect(moved.y).toBe(20);
    expect(moved.width).toBe(128);
    expect(moved.height).toBe(128);
    expect(band.getBounds().x).toBe(10);
    expect(band.getBounds().y).toBe(20);
  });

  it('a world-root transform applies to bands and actors alike', () => {
    const { band, actors, worldRoot } = makeTransformScene();

    worldRoot.setPosition(100, 50);

    expect(band.getBounds().x).toBe(100);
    expect(band.getBounds().y).toBe(50);
    expect(actors.getBounds().x).toBe(100);
    expect(actors.getBounds().y).toBe(50);
  });

  it('moving actors mutates no view or band state', () => {
    const { view, band, node, actors } = makeTransformScene();
    const { x, y, width } = band.getBounds();

    actors.setPosition(500, 400);

    expect(band.x).toBe(0);
    expect(band.getBounds().x).toBe(x);
    expect(band.getBounds().y).toBe(y);
    expect(band.getBounds().width).toBe(width);
    expect(view.getLayerNodeById(1)).toBe(node);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// TileMapBand — bounds
// ═══════════════════════════════════════════════════════════════════════

describe('TileMapBand bounds', () => {
  function makeBoundsScene(
    layerOpts: readonly LayerOpts[],
    definition: TileMapBandDefinition,
  ): { map: TileMap; view: TileMapView; band: TileMapBand } {
    const tileset = makeTileset();
    const map = new TileMap({
      name: 'bounds',
      width: 4,
      height: 4,
      tileWidth: 32,
      tileHeight: 32,
      tilesets: [tileset],
      layers: layerOpts.map(opts => makeLayer(tileset, opts)),
    });
    const view = map.createView({ bands: { band: definition } });

    return { map, view, band: view.band('band') };
  }

  it('an empty band collapses to a degenerate rect at its transformed origin', () => {
    const { band } = makeBoundsScene([], []);

    const rect = band.getBounds();

    expect([rect.x, rect.y, rect.width, rect.height]).toEqual([0, 0, 0, 0]);

    band.setPosition(5, 7);

    const moved = band.getBounds();

    expect([moved.x, moved.y, moved.width, moved.height]).toEqual([5, 7, 0, 0]);
  });

  it('a single-layer band matches the layer node bounds', () => {
    const { view, band } = makeBoundsScene([{ id: 1, name: 'a' }], [1]);
    const nodeRect = view.getLayerNodeById(1)!.getBounds();
    const snapshot = [nodeRect.x, nodeRect.y, nodeRect.width, nodeRect.height];

    expect(snapshot).toEqual([0, 0, 128, 128]);

    const rect = band.getBounds();

    expect([rect.x, rect.y, rect.width, rect.height]).toEqual(snapshot);
  });

  it('a multi-layer band is the union of its layer bounds', () => {
    const { band } = makeBoundsScene(
      [{ id: 1, name: 'a' }, { id: 2, name: 'b', width: 2, height: 2, offsetX: 200 }],
      [1, 2],
    );

    const rect = band.getBounds();

    expect([rect.x, rect.y, rect.width, rect.height]).toEqual([0, 0, 264, 128]);
  });

  it('an offset layer keeps the band bounds at its world rect (no origin extension)', () => {
    const { band } = makeBoundsScene([{ id: 1, name: 'a', offsetX: 64, offsetY: 32 }], [1]);

    const rect = band.getBounds();

    // The union covers children only — it is NOT stretched back to (0, 0).
    expect([rect.x, rect.y, rect.width, rect.height]).toEqual([64, 32, 128, 128]);
  });

  it('bounds shrink after a member layer is removed and the view refreshed', () => {
    const { map, view, band } = makeBoundsScene(
      [{ id: 1, name: 'a' }, { id: 2, name: 'b', width: 2, height: 2, offsetX: 200 }],
      [1, 2],
    );

    expect(band.getBounds().width).toBe(264);

    map.removeLayer(2);
    view.refreshLayers();

    const rect = band.getBounds();

    expect([rect.x, rect.y, rect.width, rect.height]).toEqual([0, 0, 128, 128]);
  });

  it('bounds reflect an ancestor transform (world space)', () => {
    const { band } = makeBoundsScene([{ id: 1, name: 'a' }], [1]);
    const worldRoot = new Container();

    worldRoot.addChild(band);
    worldRoot.setPosition(50, 60);
    worldRoot.setScale(2);

    const rect = band.getBounds();

    expect([rect.x, rect.y, rect.width, rect.height]).toEqual([50, 60, 256, 256]);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// TileMapBand — internal membership operations (direct, bypassing TileMapView)
// ═══════════════════════════════════════════════════════════════════════

describe('TileMapBand internal membership operations', () => {
  it('updateBounds collapses to a degenerate rect when every child is invisible', () => {
    const tileset = makeTileset();
    const node = new TileLayerNode(makeLayer(tileset));
    const band = new TileMapBand('b', [node]);

    node.visible = false;
    band.setPosition(9, 4);

    const rect = band.getBounds();
    expect([rect.x, rect.y, rect.width, rect.height]).toEqual([9, 4, 0, 0]);
  });

  it('_adopt is a no-op when the node is already a member (no duplicate membership)', () => {
    const tileset = makeTileset();
    const node = new TileLayerNode(makeLayer(tileset));
    const band = new TileMapBand('b', [node]);

    expect(band.layerNodes).toHaveLength(1);

    band._adopt(node); // already a member

    expect(band.layerNodes).toHaveLength(1);
    expect(band.layerNodes[0]).toBe(node);
  });

  it('_release is a no-op for a node that was never a member', () => {
    const tileset = makeTileset();
    const memberNode = new TileLayerNode(makeLayer(tileset, { id: 1 }));
    const strangerNode = new TileLayerNode(makeLayer(tileset, { id: 2 }));
    const band = new TileMapBand('b', [memberNode]);

    expect(() => band._release(strangerNode)).not.toThrow();
    expect(band.layerNodes).toEqual([memberNode]);
  });

  it('_release does not attempt to detach a member node that was already reparented elsewhere', () => {
    const tileset = makeTileset();
    const node = new TileLayerNode(makeLayer(tileset));
    const band = new TileMapBand('b', [node]);
    const otherContainer = new Container();

    otherContainer.addChild(node); // reparent away from the band

    band._release(node); // still band membership, but node.parent !== band

    expect(band.layerNodes).toHaveLength(0);
    expect(node.parent).toBe(otherContainer); // untouched by _release
  });

  it('_reorder falls back to index 0 for either member id missing from the document map', () => {
    const tileset = makeTileset();
    const nodeA = new TileLayerNode(makeLayer(tileset, { id: 1 }));
    const nodeB = new TileLayerNode(makeLayer(tileset, { id: 2 }));
    const band = new TileMapBand('b', [nodeA, nodeB]);

    // Only nodeB's id is present in the document index map; nodeA falls back to 0
    // (covers the fallback for the comparator's first operand, the defined
    // value for its second).
    expect(() => band._reorder(new Map([[2, 5]]))).not.toThrow();
    expect(band.layerNodes).toHaveLength(2);

    // Swap which id is present, so the opposite operand hits the fallback and
    // the previously-fallback operand now resolves a defined value.
    expect(() => band._reorder(new Map([[1, 3]]))).not.toThrow();
    expect(band.layerNodes).toHaveLength(2);
  });

  it('_reorder skips re-adding a member node that is no longer parented to the band', () => {
    const tileset = makeTileset();
    const nodeA = new TileLayerNode(makeLayer(tileset, { id: 1 }));
    const nodeB = new TileLayerNode(makeLayer(tileset, { id: 2 }));
    const band = new TileMapBand('b', [nodeA, nodeB]);
    const otherContainer = new Container();

    otherContainer.addChild(nodeA); // reparent away, but membership is kept

    expect(() => band._reorder(new Map([[1, 0], [2, 1]]))).not.toThrow();
    expect(band.layerNodes).toEqual([nodeA, nodeB]); // membership unaffected
    expect(nodeA.parent).toBe(otherContainer); // not re-adopted by the band
    expect(band.children).toContain(nodeB);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Visibility / opacity
// ═══════════════════════════════════════════════════════════════════════

describe('TileMapBand visibility & opacity', () => {
  it('layer visibility and opacity are read live; the band stores no copy', () => {
    const { map, view } = makeScene();
    const band = view.band('ground');
    const node = view.getLayerNodeById(1)!;
    const layer = map.getTileLayerById(1)!;

    layer.visible = false;
    layer.opacity = 0.25;

    // The node reads the live runtime layer — no band/view API involved.
    expect(node.layer.visible).toBe(false);
    expect(node.layer.opacity).toBe(0.25);

    // The band keeps no per-layer visibility/opacity state of its own.
    expect(band.visible).toBe(true);
  });

  it('band.visible is independent Container state, not derived from layers', () => {
    const { map, view } = makeScene();
    const band = view.band('ground');

    band.visible = false;

    // Hiding the band never writes through to the runtime layers …
    expect(map.getTileLayerById(1)!.visible).toBe(true);
    expect(map.getTileLayerById(2)!.visible).toBe(true);

    // … and layer visibility never feeds back into the band.
    band.visible = true;
    map.getTileLayerById(1)!.visible = false;

    expect(band.visible).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Type contracts
// ═══════════════════════════════════════════════════════════════════════

describe('TileMapView type contracts', () => {
  it('the bands option accepts ids and names mixed in one definition', () => {
    expectTypeOf({ ground: [1, 'name'] } as const).toMatchTypeOf<NonNullable<TileMapViewOptions['bands']>>();
    expectTypeOf<Record<string, readonly (number | string)[]>>().toMatchTypeOf<NonNullable<TileMapViewOptions['bands']>>();
    expectTypeOf<{ bands: { b: (number | string)[] }; cullable: boolean }>().toMatchTypeOf<TileMapViewOptions>();
  });

  it('selector and definition unions are exact', () => {
    expectTypeOf<TileLayerSelector>().toEqualTypeOf<number | string>();
    expectTypeOf<TileMapBandDefinition>().toEqualTypeOf<readonly TileLayerSelector[]>();
  });

  it('lookups return the documented shapes', () => {
    expectTypeOf<TileMapView['getLayerNodeById']>().returns.toEqualTypeOf<TileLayerNode | undefined>();
    expectTypeOf<TileMapView['getLayerNodesByName']>().returns.toEqualTypeOf<readonly TileLayerNode[]>();
    expectTypeOf<TileMapView['band']>().returns.toEqualTypeOf<TileMapBand>();
    expectTypeOf<TileMapView['layers']>().toEqualTypeOf<readonly TileLayerNode[]>();
    expectTypeOf<TileMapView['bands']>().toEqualTypeOf<readonly TileMapBand[]>();
    expectTypeOf<TileMapBand['layerNodes']>().toEqualTypeOf<readonly TileLayerNode[]>();
  });

  it('createView returns TileMapView and its options are optional', () => {
    expectTypeOf<TileMap['createView']>().returns.toEqualTypeOf<TileMapView>();
    expectTypeOf<Parameters<TileMap['createView']>>().toEqualTypeOf<[options?: TileMapViewOptions]>();
  });
});
