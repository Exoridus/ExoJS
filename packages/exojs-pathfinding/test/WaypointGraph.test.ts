import { describe, expect, it } from 'vitest';

import { Pathfinder } from '../src/Pathfinder';
import { WaypointGraph } from '../src/spaces/WaypointGraph';

interface JumpData {
  readonly impulse: number;
}

describe('WaypointGraph', () => {
  it('reports the traversal kind and payload of every step', () => {
    const graph = new WaypointGraph<JumpData>();
    const ledge = graph.addNode(0, 100);
    const gap = graph.addNode(80, 100);
    const platform = graph.addNode(160, 40);

    graph.addEdge(ledge, gap, { kind: 'walk' });
    graph.addEdge(gap, platform, { kind: 'jump', data: { impulse: 520 } });

    const result = new Pathfinder().findPath(graph, ledge, platform);

    expect(result.status).toBe('found');
    expect(result.edges.map(edge => edge.kind)).toEqual(['walk', 'jump']);
    expect(result.edges[1]!.data?.impulse).toBe(520);
  });

  it('prices an edge by straight-line distance unless told otherwise', () => {
    const graph = new WaypointGraph();
    const a = graph.addNode(0, 0);
    const b = graph.addNode(30, 40);
    const c = graph.addNode(60, 80);

    graph.addEdge(a, b);
    graph.addEdge(b, c, { cost: 5 });

    const result = new Pathfinder().findPath(graph, a, c);

    expect(result.cost).toBeCloseTo(55, 9);
  });

  it('stays optimal when an edge is priced below its geometric length', () => {
    // A zipline shorter than the straight line would make a raw distance
    // heuristic overestimate and hand back a suboptimal route.
    const graph = new WaypointGraph();
    const start = graph.addNode(0, 0);
    const via = graph.addNode(0, 1000);
    const goal = graph.addNode(1000, 0);

    graph.addEdge(start, via, { cost: 1 });
    graph.addEdge(via, goal, { cost: 1 });
    graph.addEdge(start, goal);

    const result = new Pathfinder().findPath(graph, start, goal);

    expect(result.cost).toBeCloseTo(2, 9);
    expect(result.nodes).toEqual([start, via, goal]);
  });

  it('degrades to Dijkstra when a node has no position', () => {
    const graph = new WaypointGraph();
    const a = graph.addNode();
    const b = graph.addNode();
    const c = graph.addNode();

    graph.connect(a, b, { cost: 2 });
    graph.connect(b, c, { cost: 3 });
    graph.connect(a, c, { cost: 9 });

    expect(graph.heuristic(a, c)).toBe(0);

    const result = new Pathfinder().findPath(graph, a, c);

    expect(result.cost).toBe(5);
    expect(result.nodes).toEqual([a, b, c]);
  });

  it('keeps directed edges directed and connect() bidirectional', () => {
    const graph = new WaypointGraph();
    const high = graph.addNode(0, 0);
    const low = graph.addNode(0, 200);
    const side = graph.addNode(100, 200);

    graph.addEdge(high, low, { kind: 'fall' });
    graph.connect(low, side);

    const pathfinder = new Pathfinder();

    expect(pathfinder.findPath(graph, high, side).status).toBe('found');
    expect(pathfinder.findPath(graph, side, high).status).toBe('unreachable');
  });

  it('recycles node ids after a removal, edges included', () => {
    const graph = new WaypointGraph();
    const a = graph.addNode(0, 0);
    const b = graph.addNode(10, 0);
    const c = graph.addNode(20, 0);

    graph.connect(a, b);
    graph.connect(b, c);
    graph.removeNode(b);

    expect(new Pathfinder().findPath(graph, a, c).status).toBe('unreachable');

    const reused = graph.addNode(10, 0);

    expect(reused).toBe(b);
    // The recycled id starts with no edges: the removal cleared both the
    // outgoing list and every incoming reference to it.
    expect(new Pathfinder().findPath(graph, a, c).status).toBe('unreachable');

    graph.connect(a, reused);
    graph.connect(reused, c);

    expect(new Pathfinder().findPath(graph, a, c).status).toBe('found');
  });

  it('replaces an edge rather than duplicating it', () => {
    const graph = new WaypointGraph();
    const a = graph.addNode(0, 0);
    const b = graph.addNode(10, 0);

    graph.addEdge(a, b, { cost: 10, kind: 'walk' });
    graph.addEdge(a, b, { cost: 3, kind: 'jump' });

    const result = new Pathfinder().findPath(graph, a, b);

    expect(result.cost).toBe(3);
    expect(graph.describeEdge(a, b)?.kind).toBe('jump');
  });

  it('finds the nearest node for a coordinate query', () => {
    const graph = new WaypointGraph();
    const a = graph.addNode(0, 0);
    const b = graph.addNode(100, 0);

    graph.connect(a, b);

    const result = new Pathfinder().findPathBetween(graph, 5, 5, 90, 5);

    expect(result.nodes).toEqual([a, b]);
  });
});
