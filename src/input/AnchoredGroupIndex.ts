import type { SceneNode } from '#core/SceneNode';
import { DynamicAabbTree } from '#math/DynamicAabbTree';
import type { RenderNode } from '#rendering/RenderNode';

interface IndexedNode {
  node: RenderNode;
}

/** One group-local spatial index, independent of the group's world transform. */
export interface AnchoredGroup {
  readonly anchor: SceneNode;
  readonly nodes: Set<RenderNode>;
  tree: DynamicAabbTree<IndexedNode> | null;
  proxies: Map<RenderNode, number> | null;
}

/** Internal bookkeeping for interactive descendants of retained transform groups. */
export class AnchoredGroupIndex {
  /** Sparse groups use the original linear scan. */
  public readonly unindexed = new Set<RenderNode>();
  /** Dense groups are queried in anchor-local space. */
  public readonly indexed = new Set<AnchoredGroup>();
  private readonly _groups = new Map<SceneNode, AnchoredGroup>();
  private readonly _nodeAnchors = new Map<RenderNode, SceneNode>();
  private static readonly _promoteAt = 32;
  private static readonly _demoteAt = 8;

  public get hasNodes(): boolean {
    return this._nodeAnchors.size > 0;
  }

  public insert(node: RenderNode, anchor: SceneNode): void {
    let group = this._groups.get(anchor);

    if (group === undefined) {
      group = { anchor, nodes: new Set<RenderNode>(), tree: null, proxies: null };
      this._groups.set(anchor, group);
    }

    group.nodes.add(node);
    this._nodeAnchors.set(node, anchor);

    if (group.tree !== null) {
      const bounds = node.getBounds();

      group.proxies!.set(node, group.tree.insert(bounds.left, bounds.top, bounds.right, bounds.bottom, { node }));

      return;
    }

    this.unindexed.add(node);

    if (group.nodes.size < AnchoredGroupIndex._promoteAt) {
      return;
    }

    const tree = new DynamicAabbTree<IndexedNode>(0);
    const proxies = new Map<RenderNode, number>();

    for (const member of group.nodes) {
      const bounds = member.getBounds();

      proxies.set(member, tree.insert(bounds.left, bounds.top, bounds.right, bounds.bottom, { node: member }));
      this.unindexed.delete(member);
    }

    group.tree = tree;
    group.proxies = proxies;
    this.indexed.add(group);
  }

  public remove(node: RenderNode): void {
    const anchor = this._nodeAnchors.get(node);

    if (anchor === undefined) {
      return;
    }

    this._nodeAnchors.delete(node);

    const group = this._groups.get(anchor);

    if (group === undefined) {
      return;
    }

    group.nodes.delete(node);

    if (group.tree === null) {
      this.unindexed.delete(node);
    } else {
      const proxy = group.proxies!.get(node);

      if (proxy !== undefined) {
        group.tree.remove(proxy);
        group.proxies!.delete(node);
      }

      if (group.nodes.size <= AnchoredGroupIndex._demoteAt) {
        group.tree.destroy();
        group.tree = null;
        group.proxies = null;
        this.indexed.delete(group);

        for (const member of group.nodes) {
          this.unindexed.add(member);
        }
      }
    }

    if (group.nodes.size === 0) {
      this._groups.delete(anchor);
    }
  }

  public destroy(): void {
    for (const group of this.indexed) {
      group.tree?.destroy();
    }

    this.indexed.clear();
    this.unindexed.clear();
    this._groups.clear();
    this._nodeAnchors.clear();
  }
}
