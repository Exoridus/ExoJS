import { Container } from '@codexo/exojs';

import type { ImageLayer } from './ImageLayer';
import type { ImageLayerNode } from './ImageLayerNode';
import type { TileLayer } from './TileLayer';
import type { TileLayerNode } from './TileLayerNode';

/**
 * A named, ordered group of layer nodes ({@link TileLayerNode}s and
 * {@link ImageLayerNode}s) produced by a {@link TileMapView} for ergonomic
 * actor interleaving.
 *
 * A band is a plain {@link Container} scene node that the application parents
 * wherever it wants (typically directly under its own world root). Bands are
 * composition units only: a band owns **its generated layer nodes** and
 * never application actors. Placing actors *between* bands is done by parenting
 * the bands and the actor containers as siblings in the desired document order:
 *
 * ```ts
 * worldRoot.addChild(view.band('ground'), actors, view.band('roof'));
 * ```
 *
 * **Rendering order within a band always follows map document order**
 * ({@link import('./TileMap').TileMap.renderableLayers}), not the order layers
 * were listed in the band definition — band membership *selects* layers; it
 * never reorders them. Tile and image members interleave exactly as the map's
 * combined document order dictates.
 *
 * **Ownership:** the band owns the layer nodes it was created with. Destroying
 * the band destroys those layer nodes (and their cached chunk geometry) and
 * detaches the band from its application parent — it never touches application
 * actors, sibling bands, the {@link TileMap}, the {@link TileLayer}s /
 * {@link ImageLayer}s, or Loader-owned textures.
 *
 * Bounds are the union of the band's layer-node bounds (an empty band
 * collapses to a degenerate rect at the band's transformed origin).
 *
 * Bands are created by {@link TileMapView}; construct them through
 * {@link TileMapView} rather than directly.
 *
 * @advanced
 */
export class TileMapBand extends Container {
  /**
   * The band name (unique within its owning {@link TileMapView}). Narrows the
   * inherited {@link SceneNode.name} from `string | null` to a required string;
   * assigned once at construction.
   */
  public override name = '';

  private readonly _layerNodes: Array<TileLayerNode | ImageLayerNode>;
  private _destroyed = false;

  /**
   * @param name       The band name (unique within its owning view).
   * @param layerNodes The layer nodes composing this band, already ordered by
   *                   map document order. Adopted as children.
   * @internal Constructed by {@link TileMapView}.
   */
  public constructor(name: string, layerNodes: ReadonlyArray<TileLayerNode | ImageLayerNode>) {
    super();

    this.name = name;
    this._layerNodes = [...layerNodes];

    for (const node of this._layerNodes) {
      this.addChild(node);
    }
  }

  /**
   * The layer nodes that compose this band, in map document order — tile and
   * image members interleaved. This is the band's **membership** list (the
   * nodes it owns and destroys); it may differ from {@link Container.children}
   * if the caller reparents an individual layer node elsewhere.
   */
  public get layerNodes(): ReadonlyArray<TileLayerNode | ImageLayerNode> {
    return this._layerNodes;
  }

  /**
   * Find this band's layer node rendering the layer with the given id (tile or
   * image member; first match in document order).
   */
  public getLayerNodeById(id: number): TileLayerNode | ImageLayerNode | undefined {
    return this._layerNodes.find(node => node.layer.id === id);
  }

  /** Whether this band currently owns no layer nodes. */
  public get isEmpty(): boolean {
    return this._layerNodes.length === 0;
  }

  /**
   * Bounds are the union of the band's visible layer-node bounds. With no
   * visible children the band collapses to a degenerate rect at its transformed
   * origin (rather than the whole-subtree-plus-origin union a bare Container
   * would report).
   */
  public override updateBounds(): this {
    this._bounds.reset();

    let hasVisibleChild = false;

    for (const child of this.children) {
      if (child.visible) {
        this._bounds.addRect(child.getBounds());
        hasVisibleChild = true;
      }
    }

    if (!hasVisibleChild) {
      this._bounds.addRect(this.getLocalBounds(), this.getGlobalTransform());
    }

    return this;
  }

  /**
   * Adopt a freshly created layer node into this band (used by
   * {@link TileMapView.refreshLayers} when a newly added map layer joins this
   * band). Appended; call {@link TileMapBand._reorder} afterwards to restore
   * map document order.
   * @internal
   */
  public _adopt(node: TileLayerNode | ImageLayerNode): void {
    if (!this._layerNodes.includes(node)) {
      this._layerNodes.push(node);
    }

    this.addChild(node);
  }

  /**
   * Drop a layer node from this band's membership without destroying it (used
   * when its map layer was removed; the view destroys the node separately).
   * @internal
   */
  public _release(node: TileLayerNode | ImageLayerNode): void {
    const index = this._layerNodes.indexOf(node);

    if (index !== -1) {
      this._layerNodes.splice(index, 1);
    }

    if (node.parent === this) {
      this.removeChild(node);
    }
  }

  /**
   * Reorder this band's membership and its still-parented children to map
   * document order. `documentIndex` maps a layer **instance** to its index in
   * the map's combined document order — keyed by instance rather than id
   * because a tile layer and an image layer may share an id in fallback-ordered
   * maps. Layer nodes the caller has reparented away from this band keep their
   * membership (for ownership) but are not re-adopted.
   * @internal
   */
  public _reorder(documentIndex: ReadonlyMap<TileLayer | ImageLayer, number>): void {
    this._layerNodes.sort(
      (a, b) => (documentIndex.get(a.layer) ?? 0) - (documentIndex.get(b.layer) ?? 0),
    );

    for (const node of this._layerNodes) {
      if (node.parent === this) {
        this.addChild(node);
      }
    }
  }

  /**
   * Destroy the band: detach it from its application parent, then destroy the
   * layer nodes it owns (freeing their chunk geometry / image sprites).
   * Application actors, sibling bands, the map, layers, and Loader-owned
   * textures are untouched.
   *
   * Idempotent: a second call (e.g. when {@link TileMapView.destroy} runs after
   * the application already destroyed this band directly) is a safe no-op.
   */
  public override destroy(): void {
    if (this._destroyed) {
      return;
    }
    this._destroyed = true;

    this.parent?.removeChild(this);

    const owned = [...this._layerNodes];

    this._layerNodes.length = 0;

    super.destroy();

    for (const node of owned) {
      node.parent?.removeChild(node);
      node.destroy();
    }
  }
}
