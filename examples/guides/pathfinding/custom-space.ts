import type { Vector } from '@codexo/exojs';
import type { NavigationSpace } from '@codexo/exojs-pathfinding';

declare const rooms: readonly { x: number; y: number; exits: readonly number[]; travelTime: number }[];

// #region guide:custom-space
/** A room graph: one node per room, cost in seconds of travel. */
class RoomSpace implements NavigationSpace {
  public readonly maxDegree = 6;
  public readonly revision = 0;

  public get nodeCapacity(): number {
    return rooms.length;
  }

  // The buffers belong to the pathfinder and are reused, so a custom space is
  // allocation-free on the same terms as the built-in ones.
  public neighbors(node: number, _agentSize: number, outNodes: Int32Array, outCosts: Float64Array): number {
    const { exits } = rooms[node]!;

    for (let index = 0; index < exits.length; index++) {
      outNodes[index] = exits[index]!;
      outCosts[index] = rooms[exits[index]!]!.travelTime;
    }

    return exits.length;
  }

  // Must never overestimate. Returning 0 is always safe and turns the search
  // into Dijkstra.
  public heuristic(): number {
    return 0;
  }

  public nodeToPoint(node: number, out: Vector): void {
    out.set(rooms[node]!.x, rooms[node]!.y);
  }

  public pointToNode(): number {
    return -1;
  }
}
// #endregion guide:custom-space

void RoomSpace;
