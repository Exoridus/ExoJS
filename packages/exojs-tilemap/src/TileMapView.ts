import type { TileLayer } from './TileLayer';
import { TileLayerNode } from './TileLayerNode';
import type { TileMap } from './TileMap';
import { TileMapBand } from './TileMapBand';

/**
 * A layer selector inside a {@link TileMapBandDefinition}: either a stable
 * layer **id** (`number`) or a **unique** layer **name** (`string`). Names that
 * are shared by more than one layer are rejected as ambiguous — reference such
 * layers by id.
 * @advanced
 */
export type TileLayerSelector = number | string;

/**
 * The layers composing one band, by id or unique name, in any order. Rendering
 * order always follows map document order regardless of the order listed here —
 * a definition *selects* layers, it never reorders them. The band's name is the
 * key it is registered under in {@link TileMapViewOptions.bands}.
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
   * cannot occur). Each value lists the layers that compose the band. Layers
   * not listed in any band remain reachable through
   * {@link TileMapView.getLayerNodeById} and friends and are owned directly by
   * the view (no implicit fallback band). The definition is copied and frozen;
   * mutating the caller's object afterwards does not change band assignments.
   *
   * @throws (at construction) on an unknown layer id, an unknown or ambiguous
   *   layer name, a layer listed twice within one band, or a layer assigned to
   *   more than one band.
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
 * @advanced
 */
export class TileMapView {
  private readonly _map: TileMap;
  private readonly _cullable: boolean;

  /** All canonical layer nodes, in map document order. */
  private readonly _layerNodes: TileLayerNode[] = [];
  /** Layer id → its canonical layer node. */
  private readonly _layerNodeById: Map<number, TileLayerNode> = new Map();

  /** Bands in definition (insertion) order. */
  private readonly _bands: TileMapBand[] = [];
  /** Band name → band. */
  private readonly _bandByName: Map<string, TileMapBand> = new Map();
  /** Original band definitions (frozen) for re-resolution on refresh. */
  private readonly _bandDefs: ResolvedBandDef[] = [];
  /** Layer node → its owning band (absent = view-owned / unbanded). */
  private readonly _nodeBand: Map<TileLayerNode, TileMapBand> = new Map();
  /** Unbanded layer nodes owned directly by the view, in map document order. */
  private readonly _directLayerNodes: TileLayerNode[] = [];

  private _destroyed = false;

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

  /** All canonical layer nodes, one per map layer, in map document order. */
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
   * The canonical layer node for the layer with the given **id**, or
   * `undefined`. Ids are authoritative and unique — this is the unambiguous
   * lookup. The returned node may be reparented into the caller's own
   * containers; the view still tracks it for refresh and destruction.
   */
  public getLayerNodeById(id: number): TileLayerNode | undefined {
    return this._layerNodeById.get(id);
  }

  /**
   * Every canonical layer node whose layer has the given **name**, in map
   * document order. Layer names are not guaranteed unique, so this returns an
   * array (empty when no layer matches). Prefer {@link getLayerNodeById} when
   * you have the id.
   */
  public getLayerNodesByName(name: string): readonly TileLayerNode[] {
    return this._layerNodes.filter(node => node.layer.name === name);
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
   * Rebuild the view after **structural** map changes (layers added to or
   * removed from the map). Ordinary tile edits and chunk creation/removal do
   * NOT need this — those are handled by chunk revisions and
   * {@link TileLayerNode.refresh} respectively.
   *
   * - Removed layers: their generated layer node is detached and destroyed.
   * - Unchanged layers: keep their existing layer node (stable identity).
   * - Added layers: a new layer node is created and assigned to the first band
   *   whose definition selects it (by id, or by a currently-unambiguous name),
   *   otherwise owned directly by the view.
   * - Every band's children are re-ordered to map document order.
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
        this._removeNode(node);
      }
    }

    // 2. Re-derive the doc-ordered node list, creating + assigning new nodes.
    const newOrder: TileLayerNode[] = [];

    for (const layer of currentLayers) {
      let node = this._layerNodeById.get(layer.id);

      if (!node) {
        node = new TileLayerNode(layer, { cullable: this._cullable });
        this._layerNodeById.set(layer.id, node);
        this._assignNewNode(node, layer);
      }

      newOrder.push(node);
    }

    this._layerNodes.length = 0;
    this._layerNodes.push(...newOrder);

    // 3. Re-order each band's children to map document order.
    const documentIndexById = new Map<number, number>();

    currentLayers.forEach((layer, index) => documentIndexById.set(layer.id, index));

    for (const band of this._bands) {
      band._reorder(documentIndexById);
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
   * Destroy the view: every band and generated layer node is destroyed (and
   * detached from its application parent), freeing cached chunk geometry.
   * Idempotent. Application actors, sibling content, the {@link TileMap}, its
   * {@link TileLayer}s, and Loader-owned tileset textures all survive.
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

    this._bands.length = 0;
    this._bandByName.clear();
    this._bandDefs.length = 0;
    this._directLayerNodes.length = 0;
    this._layerNodes.length = 0;
    this._layerNodeById.clear();
    this._nodeBand.clear();
  }

  // ── Internals ──────────────────────────────────────────────────────────

  /** Resolve one band definition into a {@link TileMapBand} and record it. */
  private _defineBand(name: string, selectors: TileMapBandDefinition): void {
    const memberIds = new Set<number>();

    for (const selector of selectors) {
      const id = this._resolveSelector(name, selector);

      if (memberIds.has(id)) {
        throw new Error(`TileMapView band "${name}" lists layer ${id} more than once.`);
      }

      const existing = this._layerNodeById.get(id);

      if (existing && this._nodeBand.has(existing)) {
        throw new Error(
          `TileMapView layer ${id} is assigned to multiple bands ` +
            `("${this._nodeBand.get(existing)!.name}" and "${name}").`,
        );
      }

      memberIds.add(id);
    }

    // Order members by map document order (membership selects; doc order renders).
    const orderedNodes = this._layerNodes.filter(node => memberIds.has(node.layer.id));
    const band = new TileMapBand(name, orderedNodes);

    for (const node of orderedNodes) {
      this._nodeBand.set(node, band);
    }

    this._bands.push(band);
    this._bandByName.set(name, band);
    this._bandDefs.push({ name, selectors: Object.freeze([...selectors]) });
  }

  /** Resolve a single selector to a layer id, throwing on unknown/ambiguous. */
  private _resolveSelector(bandName: string, selector: TileLayerSelector): number {
    if (typeof selector === 'number') {
      if (!this._layerNodeById.has(selector)) {
        throw new Error(
          `TileMapView band "${bandName}": no layer with id ${selector} in map "${this._map.name}".`,
        );
      }

      return selector;
    }

    const matches = this._map.layers.filter(layer => layer.name === selector);

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

    return matches[0]!.id;
  }

  /** Assign a freshly created node to the first band that selects its layer. */
  private _assignNewNode(node: TileLayerNode, layer: TileLayer): void {
    for (const def of this._bandDefs) {
      if (this._definitionSelects(def, layer)) {
        const band = this._bandByName.get(def.name)!;

        band._adopt(node);
        this._nodeBand.set(node, band);

        return;
      }
    }
  }

  /** Whether a band definition selects the given layer (unambiguously by name). */
  private _definitionSelects(def: ResolvedBandDef, layer: TileLayer): boolean {
    for (const selector of def.selectors) {
      if (typeof selector === 'number') {
        if (selector === layer.id) {
          return true;
        }
      } else if (selector === layer.name) {
        const sameName = this._map.layers.filter(other => other.name === selector).length;

        if (sameName === 1) {
          return true;
        }
      }
    }

    return false;
  }

  /** Detach + destroy a node, dropping it from band membership and registries. */
  private _removeNode(node: TileLayerNode): void {
    const band = this._nodeBand.get(node);

    if (band) {
      band._release(node);
      this._nodeBand.delete(node);
    } else {
      const directIndex = this._directLayerNodes.indexOf(node);

      if (directIndex !== -1) {
        this._directLayerNodes.splice(directIndex, 1);
      }
    }

    node.parent?.removeChild(node);
    this._layerNodeById.delete(node.layer.id);

    const orderIndex = this._layerNodes.indexOf(node);

    if (orderIndex !== -1) {
      this._layerNodes.splice(orderIndex, 1);
    }

    node.destroy();
  }
}
