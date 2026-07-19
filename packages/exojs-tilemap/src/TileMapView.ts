import { PixelSnapMode } from '@codexo/exojs/renderer-sdk';

import { ImageLayer } from './ImageLayer';
import { ImageLayerNode } from './ImageLayerNode';
import { assertPixelSnapMode } from './pixelSnap';
import type { TileLayer } from './TileLayer';
import { TileLayerNode } from './TileLayerNode';
import type { TileMap } from './TileMap';
import { TileMapBand } from './TileMapBand';

/**
 * A layer selector inside a {@link TileMapBandDefinition}: either a stable
 * layer **id** (`number`) or a **unique** layer **name** (`string`). Selectors
 * resolve across the map's tile **and** image layers. Names that are shared by
 * more than one layer (of either kind) are rejected as ambiguous — reference
 * such layers by id. An id shared by a tile layer and an image layer (possible
 * only in fallback-ordered maps, which never validated cross-kind uniqueness)
 * is equally ambiguous — reference such layers by a unique name.
 * @advanced
 */
export type TileLayerSelector = number | string;

/**
 * The layers composing one band, by id or unique name, in any order. Tile and
 * image layers may be freely mixed. Rendering order always follows the map's
 * combined document order ({@link import('./TileMap').TileMap.renderableLayers})
 * regardless of the order listed here — a definition *selects* layers, it never
 * reorders them. The band's name is the key it is registered under in
 * {@link TileMapViewOptions.bands}.
 * @advanced
 */
export type TileMapBandDefinition = readonly TileLayerSelector[];

/**
 * Options for a {@link TileMapView}.
 * @advanced
 */
export interface TileMapViewOptions {
  /**
   * Named bands, keyed by band name (keys are unique, so duplicate band names
   * cannot occur). Each value lists the layers that compose the band — tile
   * and image layers alike. Layers not listed in any band remain reachable
   * through {@link TileMapView.getLayerNodeById} and friends and are owned
   * directly by the view (no implicit fallback band). The definition is copied
   * and frozen; mutating the caller's object afterwards does not change band
   * assignments.
   *
   * @throws (at construction) on an unknown layer id, an unknown or ambiguous
   *   layer name, a cross-kind ambiguous layer id, a layer listed twice within
   *   one band, or a layer assigned to more than one band.
   */
  readonly bands?: Readonly<Record<string, TileMapBandDefinition>>;
  /**
   * Whether the generated {@link TileLayerNode}s' chunks participate in
   * per-chunk view culling. Forwarded to every layer node. Default `true`.
   */
  readonly cullable?: boolean;
}

interface ResolvedBandDef {
  readonly name: string;
  readonly selectors: TileMapBandDefinition;
}

/**
 * Groups a {@link TileMap}'s layers into independently placeable scene nodes so
 * application actors can be interleaved **between** tile layers.
 *
 * A view produces exactly one canonical {@link TileLayerNode} per map layer
 * (stable identity, map document order) and, optionally, named {@link TileMapBand}s
 * grouping subsets of those nodes. The application parents the bands / layer
 * nodes wherever it wants — typically as siblings of its own actor containers:
 *
 * ```ts
 * const view = map.createView({ bands: { ground: ['background', 'ground'], roof: ['roofs'] } });
 * worldRoot.addChild(view.band('ground'), actors, view.band('roof'));
 * // or without bands:
 * worldRoot.addChild(view.getLayerNodeById(groundId)!, actors, view.getLayerNodeById(roofId)!);
 * ```
 *
 * **Actors are application-owned siblings.** A `TileMapView` never adopts or
 * destroys actors. The view is a helper, not a scene node — it does not own the
 * world container, the {@link TileMap}, the {@link TileLayer}s, or tileset
 * textures.
 *
 * **Ownership:** the view owns its generated layer nodes and bands. A layer
 * assigned to a band is owned by that band; an unbanded layer is owned by the
 * view directly. {@link TileMapView.destroy} destroys every band and layer node
 * (detaching them from their application parents) but leaves actors, the map,
 * its layers, and Loader-owned textures untouched. There is no map-replacement
 * mutation API: to swap maps, destroy the old view, construct a new one, and
 * re-parent its bands — the actor tree is never involved.
 *
 * **Image layers.** A view also produces exactly one canonical
 * {@link ImageLayerNode} per {@link TileMap.imageLayers} entry (stable identity,
 * map document order), reachable through {@link imageLayerNodes},
 * {@link getImageLayerNodeById}, and {@link getImageLayerNodeByName}. Image
 * layers are selectable in {@link TileMapViewOptions.bands} exactly like tile
 * layers: a band member list may mix both kinds, and the band stacks its
 * members by the map's combined document order
 * ({@link import('./TileMap').TileMap.renderableLayers}). A banded image node
 * is owned by its band; an unbanded one is owned by the view directly, and the
 * application parents it wherever the image belongs in draw order — the same
 * way actors are interleaved.
 *
 * @advanced
 */
export class TileMapView {
  private readonly _map: TileMap;
  private readonly _cullable: boolean;

  /** All canonical tile-layer nodes, in map document order. */
  private readonly _layerNodes: TileLayerNode[] = [];
  /** Tile layer id → its canonical layer node. */
  private readonly _layerNodeById = new Map<number, TileLayerNode>();

  /** Bands in definition (insertion) order. */
  private readonly _bands: TileMapBand[] = [];
  /** Band name → band. */
  private readonly _bandByName = new Map<string, TileMapBand>();
  /** Original band definitions (frozen) for re-resolution on refresh. */
  private readonly _bandDefs: ResolvedBandDef[] = [];
  /** Layer node → its owning band (absent = view-owned / unbanded). */
  private readonly _nodeBand = new Map<TileLayerNode | ImageLayerNode, TileMapBand>();
  /** Unbanded tile-layer nodes owned directly by the view, in map document order. */
  private readonly _directLayerNodes: TileLayerNode[] = [];

  /** All canonical image layer nodes, in map document order. */
  private readonly _imageLayerNodes: ImageLayerNode[] = [];
  /** Image layer id → its canonical image layer node. */
  private readonly _imageLayerNodeById = new Map<number, ImageLayerNode>();

  private _destroyed = false;
  private _pixelSnapMode: PixelSnapMode = PixelSnapMode.None;

  /**
   * @param map     The runtime map to compose. Referenced, never owned.
   * @param options Band definitions and culling.
   * @throws When a band definition references an unknown/ambiguous layer or
   *         assigns a layer twice / to multiple bands.
   */
  public constructor(map: TileMap, options?: TileMapViewOptions) {
    this._map = map;
    this._cullable = options?.cullable ?? true;

    for (const layer of map.layers) {
      const node = new TileLayerNode(layer, { cullable: this._cullable });

      this._layerNodes.push(node);
      this._layerNodeById.set(layer.id, node);
    }

    for (const imageLayer of map.imageLayers) {
      const imageNode = new ImageLayerNode(imageLayer);

      this._imageLayerNodes.push(imageNode);
      this._imageLayerNodeById.set(imageLayer.id, imageNode);
    }

    if (options?.bands) {
      for (const [name, selectors] of Object.entries(options.bands)) {
        this._defineBand(name, selectors);
      }
    }

    for (const node of this._layerNodes) {
      if (!this._nodeBand.has(node)) {
        this._directLayerNodes.push(node);
      }
    }
  }

  /** The runtime map this view composes. Referenced, never owned. */
  public get map(): TileMap {
    return this._map;
  }

  /** All canonical tile-layer nodes, one per map tile layer, in map document order. */
  public get layers(): readonly TileLayerNode[] {
    return this._layerNodes;
  }

  /** The bands, in definition (insertion) order. */
  public get bands(): readonly TileMapBand[] {
    return this._bands;
  }

  /** Whether this view has been destroyed. */
  public get destroyed(): boolean {
    return this._destroyed;
  }

  /**
   * Render-only pixel-snap mode applied to every layer node this view owns (and
   * forwarded to every chunk drawable, current and rebuilt by
   * {@link refreshLayers}). Snaps tile chunk origins to the active render
   * target's device-pixel grid for crisp tiles; with integer tile pitch the grid
   * stays exact and adjacent chunks cannot drift apart. Purely visual — tile
   * data, layer offsets, chunk revisions, and culling are unchanged. Setting the
   * current value is a no-op; an invalid value throws and leaves the prior mode
   * unchanged.
   *
   * @default PixelSnapMode.None
   * @stable
   */
  public get pixelSnapMode(): PixelSnapMode {
    return this._pixelSnapMode;
  }

  public set pixelSnapMode(mode: PixelSnapMode) {
    if (mode === this._pixelSnapMode) {
      return;
    }

    assertPixelSnapMode(mode);
    this._pixelSnapMode = mode;

    for (const node of this._layerNodes) {
      node.pixelSnapMode = mode;
    }

    for (const node of this._imageLayerNodes) {
      node.pixelSnapMode = mode;
    }
  }

  /**
   * The canonical layer node for the **tile** layer with the given **id**, or
   * `undefined`. Tile ids are authoritative and unique — this is the
   * unambiguous lookup. The returned node may be reparented into the caller's
   * own containers; the view still tracks it for refresh and destruction.
   */
  public getLayerNodeById(id: number): TileLayerNode | undefined {
    return this._layerNodeById.get(id);
  }

  /**
   * Every canonical tile-layer node whose layer has the given **name**, in map
   * document order. Layer names are not guaranteed unique, so this returns an
   * array (empty when no layer matches). Prefer {@link getLayerNodeById} when
   * you have the id.
   */
  public getLayerNodesByName(name: string): readonly TileLayerNode[] {
    return this._layerNodes.filter(node => node.layer.name === name);
  }

  /** All canonical image layer nodes, one per map image layer, in map document order. */
  public get imageLayerNodes(): readonly ImageLayerNode[] {
    return this._imageLayerNodes;
  }

  /**
   * The canonical image layer node for the image layer with the given **id**,
   * or `undefined`. Ids are authoritative and unique — this is the unambiguous
   * lookup. The returned node may be reparented into the caller's own
   * containers; the view still tracks it for refresh and destruction.
   */
  public getImageLayerNodeById(id: number): ImageLayerNode | undefined {
    return this._imageLayerNodeById.get(id);
  }

  /**
   * The canonical image layer node for the image layer with the given
   * **name**, or `undefined` if no image layer has that name. Prefer
   * {@link getImageLayerNodeById} when you have the id.
   * @throws If more than one image layer shares that name (reference such
   *         layers by id instead).
   */
  public getImageLayerNodeByName(name: string): ImageLayerNode | undefined {
    const matches = this._map.imageLayers.filter(layer => layer.name === name);

    if (matches.length === 0) {
      return undefined;
    }

    if (matches.length > 1) {
      throw new Error(
        `TileMapView image layer name "${name}" is ambiguous ` +
          `(${matches.length} image layers share it); reference it by id instead.`,
      );
    }

    return this._imageLayerNodeById.get(matches[0]!.id);
  }

  /**
   * The band registered under `name`.
   * @throws If no band with that name was defined.
   */
  public band(name: string): TileMapBand {
    const band = this._bandByName.get(name);

    if (!band) {
      throw new Error(
        `TileMapView has no band named "${name}". Defined bands: ${
          this._bands.length ? this._bands.map(b => `"${b.name}"`).join(', ') : '(none)'
        }.`,
      );
    }

    return band;
  }

  /** Whether a band with the given name was defined. */
  public hasBand(name: string): boolean {
    return this._bandByName.has(name);
  }

  /**
   * Rebuild the view after **structural** map changes (tile or image layers
   * added to or removed from the map). Ordinary tile edits and chunk
   * creation/removal do NOT need this — those are handled by chunk revisions
   * and {@link TileLayerNode.refresh} respectively.
   *
   * - Removed layers (tile or image): their generated node is detached and
   *   destroyed.
   * - Unchanged layers: keep their existing node (stable identity).
   * - Added layers (tile or image): a new node is created and assigned to the
   *   first band whose definition selects it (by a currently-unambiguous id or
   *   name), otherwise owned directly by the view.
   * - Every band's children are re-ordered to the map's combined document
   *   order ({@link import('./TileMap').TileMap.renderableLayers}).
   *
   * Application actors are never touched, and bands keep their placement in the
   * application scene graph.
   *
   * @throws If the view has been destroyed.
   */
  public refreshLayers(): this {
    if (this._destroyed) {
      throw new Error('Cannot refresh a destroyed TileMapView.');
    }

    const currentLayers = this._map.layers;
    const currentIds = new Set<number>();

    for (const layer of currentLayers) {
      currentIds.add(layer.id);
    }

    // 1. Remove nodes whose layer no longer exists.
    for (const node of [...this._layerNodes]) {
      if (!currentIds.has(node.layer.id)) {
        this._removeTileNode(node);
      }
    }

    const currentImageLayers = new Set(this._map.imageLayers);

    for (const node of [...this._imageLayerNodes]) {
      if (!currentImageLayers.has(node.layer)) {
        this._removeImageNode(node);
      }
    }

    // 2. Re-derive the doc-ordered node lists, creating + assigning new nodes.
    const newOrder: TileLayerNode[] = [];

    for (const layer of currentLayers) {
      let node = this._layerNodeById.get(layer.id);

      if (!node) {
        node = new TileLayerNode(layer, { cullable: this._cullable });

        if (this._pixelSnapMode !== PixelSnapMode.None) {
          node.pixelSnapMode = this._pixelSnapMode;
        }

        this._layerNodeById.set(layer.id, node);
        this._assignNewNode(node, layer);
      }

      newOrder.push(node);
    }

    this._layerNodes.length = 0;
    this._layerNodes.push(...newOrder);

    const newImageOrder: ImageLayerNode[] = [];

    for (const imageLayer of this._map.imageLayers) {
      let node = this._imageLayerNodes.find(candidate => candidate.layer === imageLayer);

      if (!node) {
        node = new ImageLayerNode(imageLayer);

        if (this._pixelSnapMode !== PixelSnapMode.None) {
          node.pixelSnapMode = this._pixelSnapMode;
        }

        this._imageLayerNodeById.set(imageLayer.id, node);
        this._assignNewNode(node, imageLayer);
      }

      newImageOrder.push(node);
    }

    this._imageLayerNodes.length = 0;
    this._imageLayerNodes.push(...newImageOrder);

    // 3. Re-order each band's children to the combined document order. Keyed
    //    by layer instance: fallback-ordered maps may share an id across kinds.
    const documentIndex = new Map<TileLayer | ImageLayer, number>();

    for (const [index, layer] of this._map.renderableLayers.entries()) {
      documentIndex.set(layer, index);
    }

    for (const band of this._bands) {
      band._reorder(documentIndex);
    }

    // 4. Rebuild the unbanded set in doc order.
    this._directLayerNodes.length = 0;

    for (const node of newOrder) {
      if (!this._nodeBand.has(node)) {
        this._directLayerNodes.push(node);
      }
    }

    return this;
  }

  /**
   * Destroy the view: every band, generated tile-layer node, and generated
   * {@link ImageLayerNode} is destroyed (and detached from its application
   * parent), freeing cached chunk geometry. Banded nodes are destroyed by
   * their band; unbanded ones by the view directly. Idempotent. Application
   * actors, sibling content, the {@link TileMap}, its {@link TileLayer}s and
   * image layers, and Loader-owned textures all survive.
   */
  public destroy(): void {
    if (this._destroyed) {
      return;
    }

    this._destroyed = true;

    for (const band of this._bands) {
      band.destroy();
    }

    for (const node of this._directLayerNodes) {
      node.parent?.removeChild(node);
      node.destroy();
    }

    for (const node of this._imageLayerNodes) {
      if (this._nodeBand.has(node)) {
        continue; // Owned and already destroyed by its band.
      }

      node.parent?.removeChild(node);
      node.destroy();
    }

    this._bands.length = 0;
    this._bandByName.clear();
    this._bandDefs.length = 0;
    this._directLayerNodes.length = 0;
    this._layerNodes.length = 0;
    this._layerNodeById.clear();
    this._nodeBand.clear();
    this._imageLayerNodes.length = 0;
    this._imageLayerNodeById.clear();
  }

  // ── Internals ──────────────────────────────────────────────────────────

  /** Resolve one band definition into a {@link TileMapBand} and record it. */
  private _defineBand(name: string, selectors: TileMapBandDefinition): void {
    const members = new Set<TileLayer | ImageLayer>();

    for (const selector of selectors) {
      const layer = this._resolveSelector(name, selector);

      if (members.has(layer)) {
        throw new Error(`TileMapView band "${name}" lists layer ${layer.id} more than once.`);
      }

      const existing = this._nodeFor(layer);

      if (existing && this._nodeBand.has(existing)) {
        throw new Error(
          `TileMapView layer ${layer.id} is assigned to multiple bands ` +
            `("${this._nodeBand.get(existing)!.name}" and "${name}").`,
        );
      }

      members.add(layer);
    }

    // Order members by combined document order (membership selects; doc order
    // renders — tile and image members interleave).
    const orderedNodes: Array<TileLayerNode | ImageLayerNode> = [];

    for (const layer of this._map.renderableLayers) {
      if (members.has(layer)) {
        orderedNodes.push(this._nodeFor(layer)!);
      }
    }

    const band = new TileMapBand(name, orderedNodes);

    for (const node of orderedNodes) {
      this._nodeBand.set(node, band);
    }

    this._bands.push(band);
    this._bandByName.set(name, band);
    this._bandDefs.push({ name, selectors: Object.freeze([...selectors]) });
  }

  /**
   * Resolve a single selector to a tile or image layer instance, throwing on
   * unknown/ambiguous. Instances (not ids) disambiguate fallback-ordered maps
   * in which a tile layer and an image layer share an id.
   */
  private _resolveSelector(bandName: string, selector: TileLayerSelector): TileLayer | ImageLayer {
    if (typeof selector === 'number') {
      const tileLayer = this._map.getTileLayerById(selector);
      const imageLayer = this._map.imageLayers.find(layer => layer.id === selector);

      if (tileLayer && imageLayer) {
        throw new Error(
          `TileMapView band "${bandName}": layer id ${selector} is ambiguous ` +
            `(a tile layer and an image layer share it); reference it by a unique name instead.`,
        );
      }

      const layer = tileLayer ?? imageLayer;

      if (!layer) {
        throw new Error(
          `TileMapView band "${bandName}": no layer with id ${selector} in map "${this._map.name}".`,
        );
      }

      return layer;
    }

    const matches: Array<TileLayer | ImageLayer> = [
      ...this._map.layers.filter(layer => layer.name === selector),
      ...this._map.imageLayers.filter(layer => layer.name === selector),
    ];

    if (matches.length === 0) {
      throw new Error(
        `TileMapView band "${bandName}": no layer named "${selector}" in map "${this._map.name}".`,
      );
    }

    if (matches.length > 1) {
      throw new Error(
        `TileMapView band "${bandName}": layer name "${selector}" is ambiguous ` +
          `(${matches.length} layers share it); reference it by id instead.`,
      );
    }

    return matches[0]!;
  }

  /** The canonical node for a tile or image layer instance, if one exists. */
  private _nodeFor(layer: TileLayer | ImageLayer): TileLayerNode | ImageLayerNode | undefined {
    if (layer instanceof ImageLayer) {
      // Instance scan rather than the id map: image ids are not validated
      // unique, and fallback maps may collide with tile ids anyway.
      return this._imageLayerNodes.find(node => node.layer === layer);
    }

    return this._layerNodeById.get(layer.id);
  }

  /** Assign a freshly created node to the first band that selects its layer. */
  private _assignNewNode(
    node: TileLayerNode | ImageLayerNode,
    layer: TileLayer | ImageLayer,
  ): void {
    for (const def of this._bandDefs) {
      if (this._definitionSelects(def, layer)) {
        const band = this._bandByName.get(def.name)!;

        band._adopt(node);
        this._nodeBand.set(node, band);

        return;
      }
    }
  }

  /**
   * Whether a band definition selects the given layer — only by a selector
   * that is currently unambiguous (a unique name, or an id not shared across
   * kinds), mirroring {@link _resolveSelector}'s construction-time rules.
   */
  private _definitionSelects(def: ResolvedBandDef, layer: TileLayer | ImageLayer): boolean {
    for (const selector of def.selectors) {
      if (typeof selector === 'number') {
        if (selector === layer.id && !this._isCrossKindId(selector)) {
          return true;
        }
      } else if (selector === layer.name) {
        const sameName =
          this._map.layers.filter(other => other.name === selector).length +
          this._map.imageLayers.filter(other => other.name === selector).length;

        if (sameName === 1) {
          return true;
        }
      }
    }

    return false;
  }

  /** Whether an id currently belongs to both a tile layer and an image layer. */
  private _isCrossKindId(id: number): boolean {
    return (
      this._map.getTileLayerById(id) !== undefined &&
      this._map.imageLayers.some(layer => layer.id === id)
    );
  }

  /** Detach + destroy a tile node, dropping it from bands and registries. */
  private _removeTileNode(node: TileLayerNode): void {
    this._releaseFromOwner(node);

    node.parent?.removeChild(node);
    this._layerNodeById.delete(node.layer.id);

    const orderIndex = this._layerNodes.indexOf(node);

    if (orderIndex !== -1) {
      this._layerNodes.splice(orderIndex, 1);
    }

    node.destroy();
  }

  /** Detach + destroy an image node, dropping it from bands and registries. */
  private _removeImageNode(node: ImageLayerNode): void {
    this._releaseFromOwner(node);

    node.parent?.removeChild(node);

    if (this._imageLayerNodeById.get(node.layer.id) === node) {
      this._imageLayerNodeById.delete(node.layer.id);
    }

    const orderIndex = this._imageLayerNodes.indexOf(node);

    if (orderIndex !== -1) {
      this._imageLayerNodes.splice(orderIndex, 1);
    }

    node.destroy();
  }

  /** Release a node from its band, or from the view's direct-ownership list. */
  private _releaseFromOwner(node: TileLayerNode | ImageLayerNode): void {
    const band = this._nodeBand.get(node);

    if (band) {
      band._release(node);
      this._nodeBand.delete(node);
    } else if (node instanceof TileLayerNode) {
      const directIndex = this._directLayerNodes.indexOf(node);

      if (directIndex !== -1) {
        this._directLayerNodes.splice(directIndex, 1);
      }
    }
  }
}
