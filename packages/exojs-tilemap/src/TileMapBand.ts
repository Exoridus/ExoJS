import { Container } from '@codexo/exojs';

import type { TileLayerNode } from './TileLayerNode';

/**
 * A named, ordered group of {@link TileLayerNode}s produced by a
 * {@link TileMapView} for ergonomic actor interleaving.
 *
 * A band is a plain {@link Container} scene node that the application parents
 * wherever it wants (typically directly under its own world root). Bands are
 * composition units only: a band owns **its generated tile-layer nodes** and
 * never application actors. Placing actors *between* bands is done by parenting
 * the bands and the actor containers as siblings in the desired document order:
 *
 * ```ts
 * worldRoot.addChild(view.band('ground'), actors, view.band('roof'));
 * ```
 *
 * **Rendering order within a band always follows map document order**, not the
 * order layers were listed in the band definition — band membership *selects*
 * layers; it never reorders them.
 *
 * **Ownership:** the band owns the {@link TileLayerNode}s it was created with.
 * Destroying the band destroys those layer nodes (and their cached chunk
 * geometry) and detaches the band from its application parent — it never
 * touches application actors, sibling bands, the {@link TileMap}, the
 * {@link TileLayer}s, or Loader-owned tileset textures.
 *
 * Bounds are the union of the band's tile-layer-node bounds (an empty band
 * collapses to a degenerate rect at the band's transformed origin).
 *
 * Bands are created by {@link TileMapView}; construct them through
 * {@link TileMapView} rather than directly.
 *
 * @advanced
 */
export class TileMapBand extends Container {
  private readonly _name: string;
  private readonly _layerNodes: TileLayerNode[];
  private _destroyed = false;

  /**
   * @param name       The band name (unique within its owning view).
   * @param layerNodes The layer nodes composing this band, already ordered by
   *                   map document order. Adopted as children.
   * @internal Constructed by {@link TileMapView}.
   */
  public constructor(name: string, layerNodes: readonly TileLayerNode[]) {
    super();

    this._name = name;
    this._layerNodes = [...layerNodes];

    for (const node of this._layerNodes) {
      this.addChild(node);
    }
  }

  /** The band name (unique within its owning {@link TileMapView}). */
  public get name(): string {
    return this._name;
  }

  /**
   * The tile-layer nodes that compose this band, in map document order. This
   * is the band's **membership** list (the nodes it owns and destroys); it may
   * differ from {@link Container.children} if the caller reparents an
   * individual layer node elsewhere.
   */
  public get layerNodes(): readonly TileLayerNode[] {
    return this._layerNodes;
  }

  /** Find this band's layer node rendering the layer with the given id. */
  public getLayerNodeById(id: number): TileLayerNode | undefined {
    return this._layerNodes.find(node => node.layer.id === id);
  }

  /** Whether this band currently owns no layer nodes. */
  public get isEmpty(): boolean {
    return this._layerNodes.length === 0;
  }

  /**
   * Bounds are the union of the band's visible tile-layer-node bounds. With no
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
  public _adopt(node: TileLayerNode): void {
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
  public _release(node: TileLayerNode): void {
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
   * document order. `documentIndexById` maps a layer id to its index in the
   * map's layer list. Layer nodes the caller has reparented away from this band
   * keep their membership (for ownership) but are not re-adopted.
   * @internal
   */
  public _reorder(documentIndexById: ReadonlyMap<number, number>): void {
    this._layerNodes.sort(
      (a, b) => (documentIndexById.get(a.layer.id) ?? 0) - (documentIndexById.get(b.layer.id) ?? 0),
    );

    for (const node of this._layerNodes) {
      if (node.parent === this) {
        this.addChild(node);
      }
    }
  }

  /**
   * Destroy the band: detach it from its application parent, then destroy the
   * tile-layer nodes it owns (freeing their chunk geometry). Application actors,
   * sibling bands, the map, layers, and tileset textures are untouched.
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
