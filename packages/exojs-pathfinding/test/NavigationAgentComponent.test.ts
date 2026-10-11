import { type Application, Container, type PointLike, Scene, SceneDirector, type Seconds, Signal, Time, Vector } from '@codexo/exojs';
import { describe, expect, it, vi } from 'vitest';

import { NavigationAgentComponent, type NavigationAgentOptions, type NavigationStatus } from '../src/navigation/NavigationAgentComponent';
import type { NavigationMovement } from '../src/navigation/NavigationMovement';
import { Pathfinder } from '../src/Pathfinder';
import { GridSpace } from '../src/spaces/GridSpace';
import { WaypointGraph } from '../src/spaces/WaypointGraph';

const STEP = Time.seconds(1 / 60);

class MainScene extends Scene {}
const CELL = 10;

/** Moves its node directly, the simplest movement there is. */
class NodeMovement implements NavigationMovement {
  public moves = 0;
  public readonly calls: Array<'move' | 'stop'> = [];
  public stops = 0;
  public steps: Seconds[] = [];
  public frozen = false;

  public constructor(
    private readonly node: Container,
    public maxSpeed: number,
  ) {}

  public move(direction: Readonly<PointLike>, step: Seconds): void {
    expect(Math.hypot(direction.x, direction.y)).toBeLessThanOrEqual(1 + 1e-9);
    this.moves++;
    this.calls.push('move');
    this.steps.push(step);

    if (!this.frozen) {
      this.node.x += direction.x * this.maxSpeed * step;
      this.node.y += direction.y * this.maxSpeed * step;
    }
  }

  public stop(): void {
    this.stops++;
    this.calls.push('stop');
  }
}

const createApp = (): { app: Application; errors: Error[] } => {
  const errors: Error[] = [];
  const onError = new Signal<[Error]>();

  onError.add(error => errors.push(error));

  return {
    app: {
      loader: { _releaseScope: vi.fn() },
      interaction: { attachRoot: vi.fn(), detachRoot: vi.fn(), attachUIRoot: vi.fn(), detachUIRoot: vi.fn() },
      onError,
    } as unknown as Application,
    errors,
  };
};

/**
 * A 10x10 grid of 10-unit cells with a wall down column 5 that leaves a gap
 * at the bottom row.
 */
const walledGrid = (): GridSpace => GridSpace.from(10, 10, (x, y) => (x === 5 && y !== 9 ? 0 : 1), { cellSize: CELL });

const center = (x: number, y: number): PointLike => ({ x: (x + 0.5) * CELL, y: (y + 0.5) * CELL });

const setup = async <Payload = unknown>(
  options: Partial<NavigationAgentOptions<Payload>> & { space: NavigationAgentOptions<Payload>['space'] },
  start: PointLike = center(1, 1),
  speed = 60,
) => {
  const { app, errors } = createApp();
  const director = new SceneDirector(app, { main: MainScene });

  await director.change(MainScene);

  const scene = director.currentScene as Scene;
  const node = new Container();

  node.setPosition(start.x, start.y);

  const movement = new NodeMovement(node, speed);
  const agent = node.addComponent(new NavigationAgentComponent<Payload>({ movement, ...options }));
  const statuses: NavigationStatus[] = [];

  agent.onStatusChange.add(status => statuses.push(status));
  scene.addChild(node);

  const frame = (fixedSteps = 1): void => {
    director._beginFrame();

    try {
      for (let i = 0; i < fixedSteps; i++) {
        director.fixedUpdate(STEP);
      }

      director.update(STEP);
    } finally {
      director._endFrame();
    }
  };

  const runUntil = (done: () => boolean, limit = 2000): number => {
    for (let frames = 1; frames <= limit; frames++) {
      frame();

      if (done()) {
        return frames;
      }
    }

    throw new Error(`condition not met within ${limit} frames`);
  };

  return { director, errors, scene, node, movement, agent, statuses, frame, runUntil };
};

const searchesOf = (pathfinder: Pathfinder) => vi.spyOn(pathfinder, 'findPathBetween');

describe('NavigationAgentComponent', () => {
  it('navigates around a wall to a fixed destination and stops on it', async () => {
    const space = walledGrid();
    const { node, movement, agent, statuses, runUntil } = await setup({ space, search: { smooth: true } });
    const destination = { x: 83, y: 17 };

    agent.moveTo(destination);
    expect(agent.status).toBe('idle');

    runUntil(() => {
      expect(space.costAt(Math.floor(node.x / CELL), Math.floor(node.y / CELL))).toBeGreaterThan(0);

      return agent.status === 'arrived';
    });

    expect(node.x).toBeCloseTo(destination.x, 9);
    expect(node.y).toBeCloseTo(destination.y, 9);
    expect(statuses).toEqual(['navigating', 'arrived']);
    expect(agent.path!.status).toBe('found');
    // The route had to pass through the gap in the bottom row.
    expect(agent.path!.points.some(point => point.y > 9 * CELL)).toBe(true);
    expect(movement.stops).toBe(1);
    expect(agent.destination!.x).toBe(destination.x);
  });

  it('requests motion in the fixed step it runs in, never overshooting the destination', async () => {
    const space = GridSpace.from(10, 1, () => 1, { cellSize: CELL });
    const { node, movement, agent, frame } = await setup({ space }, center(0, 0), 60);

    agent.moveTo({ x: 6.5, y: 5 });
    frame();

    // 1.5 units away at 1 unit per step: one full step, then the remaining half.
    expect(node.x).toBeCloseTo(6, 9);
    frame();
    expect(node.x).toBeCloseTo(6.5, 9);
    expect(movement.steps).toEqual([STEP, STEP]);

    // Arrival is read from the position the movement produced, a step later.
    frame();
    expect(agent.status).toBe('arrived');
    expect(movement.moves).toBe(2);
  });

  it('follows a moving target and replans only when it changes node', async () => {
    const space = GridSpace.from(20, 20, () => 1, { cellSize: CELL });
    const pathfinder = new Pathfinder();
    const searches = searchesOf(pathfinder);
    const target = new Vector(155, 155);
    const { node, agent, statuses, runUntil, frame } = await setup({ space, pathfinder }, center(1, 1), 120);

    agent.follow(target);
    runUntil(() => agent.status === 'arrived');
    expect(searches).toHaveBeenCalledTimes(1);
    expect(node.x).toBeCloseTo(155, 9);
    expect(node.y).toBeCloseTo(155, 9);

    // Moving inside the node the route ends in needs no search.
    target.set(158, 151);
    runUntil(() => agent.status === 'arrived' && Math.abs(node.x - 158) < 1e-6);
    expect(searches).toHaveBeenCalledTimes(1);

    target.set(35, 155);
    runUntil(() => agent.status === 'arrived' && Math.abs(node.x - 35) < 1e-6);
    expect(searches).toHaveBeenCalledTimes(2);
    expect(node.y).toBeCloseTo(155, 9);
    expect(statuses).toEqual(['navigating', 'arrived', 'navigating', 'arrived', 'navigating', 'arrived']);

    // A stationary target costs nothing further.
    for (let i = 0; i < 120; i++) {
      frame();
    }

    expect(searches).toHaveBeenCalledTimes(2);
  });

  it('throttles automatic replans to the repath interval', async () => {
    const space = GridSpace.from(100, 3, () => 1, { cellSize: CELL });
    const pathfinder = new Pathfinder();
    const searches = searchesOf(pathfinder);
    const target = new Vector(5, 15);
    const { agent, frame } = await setup({ space, pathfinder, repathInterval: Time.seconds(0.5) }, center(0, 1), 30);

    agent.follow(target);

    // The target enters a new cell every frame for two seconds.
    for (let i = 0; i < 120; i++) {
      target.x += CELL;
      frame();
    }

    // One search for the command, then at most one per half second.
    expect(searches.mock.calls.length).toBeGreaterThanOrEqual(3);
    expect(searches.mock.calls.length).toBeLessThanOrEqual(1 + 4);
  });

  it('switches targets', async () => {
    const space = GridSpace.from(20, 20, () => 1, { cellSize: CELL });
    const first = new Vector(150, 15);
    const second = new Vector(15, 150);
    const { node, agent, runUntil } = await setup({ space }, center(1, 1), 120);

    agent.follow(first);
    runUntil(() => agent.status === 'arrived');
    agent.follow(second);
    expect(agent.target).toBe(second);
    runUntil(() => agent.status === 'arrived');
    expect(node.x).toBeCloseTo(15, 9);
    expect(node.y).toBeCloseTo(150, 9);
  });

  it('reports an unreachable destination and recovers once the space opens up', async () => {
    const space = GridSpace.from(10, 10, x => (x === 5 ? 0 : 1), { cellSize: CELL });
    const { node, movement, agent, statuses, frame, runUntil } = await setup({ space });

    agent.moveTo(center(8, 1));
    frame();

    expect(agent.status).toBe('unreachable');
    expect(movement.moves).toBe(0);

    const x = node.x;

    frame();
    expect(node.x).toBe(x);

    space.setCost(5, 4, 1);
    runUntil(() => agent.status === 'arrived');
    expect(statuses).toEqual(['unreachable', 'navigating', 'arrived']);
  });

  it('ends at the closest reachable point of a snapping search as unreachable', async () => {
    const space = GridSpace.from(10, 10, x => (x === 5 ? 0 : 1), { cellSize: CELL });
    const { node, agent, runUntil } = await setup({ space, search: { snapToNearest: true } });

    agent.moveTo(center(8, 1));
    runUntil(() => agent.status === 'unreachable');

    expect(Math.floor(node.x / CELL)).toBe(4);
  });

  it('works through budget-limited partial routes', async () => {
    const space = GridSpace.from(30, 3, () => 1, { cellSize: CELL });
    const pathfinder = new Pathfinder();
    const searches = searchesOf(pathfinder);
    const { node, agent, statuses, runUntil } = await setup(
      { space, pathfinder, search: { maxExpandedNodes: 8, pruning: false } },
      center(0, 1),
      240,
    );

    agent.moveTo(center(29, 1));
    runUntil(() => agent.status === 'arrived');

    const outcomes = searches.mock.results.map(result => result.value.status);

    expect(outcomes.filter(status => status === 'budget-exceeded').length).toBeGreaterThan(1);
    expect(outcomes.at(-1)).toBe('found');
    expect(statuses).toEqual(['navigating', 'arrived']);
    expect(node.x).toBeCloseTo(295, 9);
    expect(node.y).toBeCloseTo(15, 9);
  });

  it('gives up as unreachable when a partial route leads into a dead end', async () => {
    const space = walledGrid();
    const { agent, runUntil } = await setup({ space, search: { maxExpandedNodes: 12, pruning: false } });

    agent.moveTo(center(8, 1));
    runUntil(() => agent.status === 'unreachable');

    expect(agent.path!.status).toBe('budget-exceeded');
  });

  it('replans when the space revision changes under the route', async () => {
    const space = GridSpace.from(10, 3, () => 1, { cellSize: CELL });
    const pathfinder = new Pathfinder();
    const searches = searchesOf(pathfinder);
    const { node, agent, frame, runUntil } = await setup({ space, pathfinder }, center(0, 1), 30);

    agent.moveTo(center(9, 1));
    frame();
    space.setCost(5, 1, 0);
    runUntil(() => {
      expect(space.costAt(Math.floor(node.x / CELL), Math.floor(node.y / CELL))).toBeGreaterThan(0);

      return agent.status === 'arrived';
    });

    expect(searches).toHaveBeenCalledTimes(2);
    expect(agent.path!.revision).toBe(space.revision);
  });

  it('reports blocked when the movement makes no progress, even after a fresh route', async () => {
    const space = GridSpace.from(10, 1, () => 1, { cellSize: CELL });
    const pathfinder = new Pathfinder();
    const searches = searchesOf(pathfinder);
    const { movement, agent, frame, runUntil } = await setup({ space, pathfinder }, center(0, 0));

    movement.frozen = true;
    agent.moveTo(center(9, 0));

    const frames = runUntil(() => agent.status === 'blocked');

    expect(searches).toHaveBeenCalledTimes(2);
    expect(frames).toBeLessThanOrEqual(60);
    expect(movement.stops).toBe(1);

    // Turning blocked ends with the stop, not with one more move.
    expect(movement.calls.at(-1)).toBe('stop');

    const moves = movement.moves;

    for (let i = 0; i < 30; i++) {
      frame();
    }

    expect(agent.status).toBe('blocked');
    expect(movement.moves).toBe(moves);
    expect(searches).toHaveBeenCalledTimes(2);

    // Whatever blocked the actor may move on, so it is tried again later.
    movement.frozen = false;
    runUntil(() => agent.status === 'arrived', 600);
    expect(searches.mock.calls.length).toBeGreaterThan(2);
  });

  it('notices a stuck actor even while the space keeps changing', async () => {
    const space = GridSpace.from(10, 3, () => 1, { cellSize: CELL });
    const { movement, agent, frame } = await setup({ space }, center(0, 1));

    movement.frozen = true;
    agent.moveTo(center(9, 1));

    for (let i = 0; i < 240 && agent.status !== 'blocked'; i++) {
      if (i % 5 === 0) {
        space.setCost(9, 0, space.costAt(9, 0) === 1 ? 2 : 1);
      }

      frame();
    }

    expect(agent.status).toBe('blocked');
  });

  it('does not search again for an unchanged unreachable destination', async () => {
    const space = GridSpace.from(10, 10, x => (x === 5 ? 0 : 1), { cellSize: CELL });
    const pathfinder = new Pathfinder();
    const searches = searchesOf(pathfinder);
    const { agent, frame } = await setup({ space, pathfinder });

    for (let i = 0; i < 30; i++) {
      agent.moveTo(center(8, 1));
      frame();
    }

    expect(agent.status).toBe('unreachable');
    expect(searches).toHaveBeenCalledTimes(1);
  });

  it('walks onto the end of a partial route even with a large arrival distance', async () => {
    const space = GridSpace.from(40, 1, () => 1, { cellSize: CELL });
    const { node, agent, runUntil } = await setup(
      { space, arrivalDistance: 25, search: { maxExpandedNodes: 2, pruning: false } },
      center(0, 0),
      240,
    );

    agent.moveTo(center(39, 0));
    runUntil(() => agent.status === 'arrived', 3000);

    expect(node.x).toBeGreaterThan(395 - 25 - 1e-6);
  });

  it('does not stay arrived at an old route end once the followed target left its node', async () => {
    const space = GridSpace.from(20, 1, () => 1, { cellSize: CELL });
    const target = new Vector(55, 5);
    const { agent, statuses, runUntil, frame } = await setup({ space, arrivalDistance: 12 }, center(0, 0), 120);

    agent.follow(target);
    runUntil(() => agent.status === 'arrived');
    target.set(185, 5);
    frame();

    expect(agent.status).toBe('navigating');
    runUntil(() => agent.status === 'arrived');
    expect(statuses).toEqual(['navigating', 'arrived', 'navigating', 'arrived']);
  });

  it('stops the movement while disabled and resumes with a fresh route', async () => {
    const space = walledGrid();
    const pathfinder = new Pathfinder();
    const searches = searchesOf(pathfinder);
    const { node, movement, agent, frame, runUntil } = await setup({ space, pathfinder });

    agent.moveTo(center(8, 1));
    frame();
    frame();
    agent.enabled = false;
    expect(movement.stops).toBe(1);

    const position = [node.x, node.y];
    const moves = movement.moves;

    for (let i = 0; i < 10; i++) {
      frame();
    }

    expect([node.x, node.y]).toEqual(position);
    expect(movement.moves).toBe(moves);

    agent.enabled = true;
    runUntil(() => agent.status === 'arrived');
    expect(searches).toHaveBeenCalledTimes(2);
  });

  it('goes idle on stop() and does nothing after its node is destroyed', async () => {
    const space = walledGrid();
    const { node, movement, agent, statuses, frame } = await setup({ space });

    agent.moveTo(center(8, 1));
    frame();
    agent.stop();

    expect(agent.status).toBe('idle');
    expect(agent.path).toBeNull();
    expect(agent.destination).toBeNull();
    expect(movement.stops).toBe(1);
    expect(statuses).toEqual(['navigating', 'idle']);

    agent.moveTo(center(8, 1));
    frame();

    const moves = movement.moves;

    node.destroy();
    frame();
    expect(agent.destroyed).toBe(true);
    expect(movement.moves).toBe(moves);
    expect(movement.stops).toBe(2);
  });

  it('honours the arrival distance', async () => {
    const space = GridSpace.from(10, 1, () => 1, { cellSize: CELL });
    const { node, agent, runUntil } = await setup({ space, arrivalDistance: 12 }, center(0, 0));

    agent.moveTo(center(9, 0));
    runUntil(() => agent.status === 'arrived');

    expect(node.x).toBeGreaterThanOrEqual(95 - 12 - 1e-9);
    expect(node.x).toBeLessThanOrEqual(95 - 11 + 1e-9);
  });

  it('reads its position from the provider instead of the node', async () => {
    const space = GridSpace.from(10, 1, () => 1, { cellSize: CELL });
    const logical = new Vector(5, 5);
    const { node, agent, frame } = await setup({ space, position: logical }, { x: 900, y: 900 });

    agent.moveTo(center(9, 0));
    frame();

    // The movement moved the node, but steering started from the logical position.
    expect(node.x).toBeCloseTo(901, 9);
    expect(node.y).toBeCloseTo(900, 9);
  });

  it('navigates a waypoint graph just like a grid', async () => {
    const graph = new WaypointGraph<{ door: string }>();
    const a = graph.addNode(0, 0);
    const b = graph.addNode(100, 0);
    const c = graph.addNode(100, 100);
    const d = graph.addNode(0, 100);

    graph.connect(a, b);
    graph.connect(b, c, { kind: 'door', data: { door: 'east' } });
    graph.connect(a, d, { cost: 1000 });
    graph.connect(d, c, { cost: 1000 });

    const { node, agent, runUntil } = await setup({ space: graph }, { x: 0, y: 0 }, 240);

    agent.moveTo({ x: 100, y: 100 });
    runUntil(() => agent.status === 'arrived');

    expect(node.x).toBeCloseTo(100, 9);
    expect(node.y).toBeCloseTo(100, 9);
    expect(agent.path!.edges.map(edge => edge.kind)).toEqual(['walk', 'door']);
    expect(agent.path!.edges[1]!.data?.door).toBe('east');
  });

  it('keeps many agents following one target to one search per node change each', async () => {
    const space = GridSpace.from(40, 40, () => 1, { cellSize: CELL });
    const pathfinder = new Pathfinder();
    const searches = searchesOf(pathfinder);
    const { app } = createApp();
    const director = new SceneDirector(app, { main: MainScene });

    await director.change(MainScene);

    const scene = director.currentScene as Scene;
    const target = new Vector(205, 205);
    const agents = Array.from({ length: 24 }, (_, index) => {
      const node = new Container();

      node.setPosition(5 + (index % 6) * 30, 5 + Math.floor(index / 6) * 30);

      const agent = node.addComponent(new NavigationAgentComponent({ space, pathfinder, movement: new NodeMovement(node, 30) }));

      scene.addChild(node);
      agent.follow(target);

      return agent;
    });

    const frame = (): void => {
      director._beginFrame();
      director.fixedUpdate(STEP);
      director.update(STEP);
      director._endFrame();
    };

    const searchesPerFrame: number[] = [];

    for (let i = 0; i < 120; i++) {
      const before = searches.mock.calls.length;

      frame();
      searchesPerFrame.push(searches.mock.calls.length - before);
    }

    expect(searches).toHaveBeenCalledTimes(agents.length);

    target.set(305, 205);

    for (let i = 0; i < 60; i++) {
      const before = searches.mock.calls.length;

      frame();
      searchesPerFrame.push(searches.mock.calls.length - before);
    }

    expect(searches).toHaveBeenCalledTimes(agents.length * 2);
    // The reaction to the target's move is spread over several steps.
    expect(Math.max(...searchesPerFrame.slice(120))).toBeLessThan(agents.length);
  });

  it('rejects invalid tuning', () => {
    const space = walledGrid();
    const movement = new NodeMovement(new Container(), 1);

    expect(() => new NavigationAgentComponent({ space, movement, arrivalDistance: -1 })).toThrow(RangeError);
    expect(() => new NavigationAgentComponent({ space, movement, repathInterval: Time.seconds(Number.NaN) })).toThrow(RangeError);
  });
});
