import {
  Application,
  Color,
  Container,
  FixedResolutionCanvasSizing,
  Graphics,
  type RenderingContext,
  Scene,
  type Seconds,
} from '@codexo/exojs';
import { type DiagonalPolicy, GridSpace, Pathfinder, type PathResult } from '@codexo/exojs/pathfinding';
import { choice, demoPanel, startExample, toggle } from '@examples/runtime';

// Click-to-move over a weighted grid. Everything here is plain data: a GridSpace
// of costs and a Pathfinder, neither of which is a scene node, neither of which
// is registered with the Application. The Graphics below only *draws* what the
// query returned.
//
// The panel exposes the three decisions that actually change the answer:
//   - jump-point pruning, which returns the same optimal path from far fewer
//     expanded nodes (watch the counter) and switches itself off the moment the
//     grid stops being uniform-cost, which is what painting mud does;
//   - smoothing, which string-pulls the staircase out of the result;
//   - agent size, which restricts the route to cells a 2x2 agent fits through.

const CELL = 32;
const COLUMNS = 40;
const ROWS = 22;
const MUD_COST = 6;
const AGENT_SPEED = 260;

const WALL_COLOR = new Color(38, 44, 58);
const FLOOR_COLOR = new Color(24, 28, 38);
const MUD_COLOR = new Color(78, 62, 34);
const PATH_COLOR = new Color(254, 179, 84);
const GOAL_COLOR = new Color(255, 170, 80);
const AGENT_COLOR = new Color(240, 245, 255);

type PaintMode = 'goal' | 'wall' | 'mud';

/** Deterministic room-and-pillar layout, so the example looks the same every run. */
const initialCost = (x: number, y: number): number => {
  if (x === 0 || y === 0 || x === COLUMNS - 1 || y === ROWS - 1) {
    return 0;
  }

  if (x === 15 && y >= 5 && y <= 16 && y !== 10) {
    return 0;
  }

  if (y === 12 && x >= 22 && x <= 30 && x !== 26) {
    return 0;
  }

  return 1;
};

class GridNavigationScene extends Scene {
  private grid = GridSpace.from(COLUMNS, ROWS, initialCost, { cellSize: CELL });
  private readonly pathfinder = new Pathfinder();
  private readonly worldRoot = new Container();
  private terrain = new Graphics();
  private overlay = new Graphics();
  private result: PathResult | null = null;
  private goal = { x: COLUMNS - 3, y: ROWS - 3 };
  private agent = { x: 2.5 * CELL, y: 2.5 * CELL };
  private waypoint = 0;
  private paint: PaintMode = 'goal';
  private smooth = false;
  private pruning = true;
  private agentSize = 1;
  private diagonals: DiagonalPolicy = 'no-corner-cutting';
  private walkerPaused = false;
  private readonly onTap = (pointer: { x: number; y: number }): void => this.applyPaint(pointer.x, pointer.y);
  private panel?: ReturnType<typeof demoPanel>;

  override init(): void {
    this.worldRoot.addChild(this.terrain, this.overlay);
    this.app.input.onPointerTap.add(this.onTap);

    this.panel = demoPanel({
      scene: this,
      layout: 'bar',
      actions: {
        'Pause / Resume': () => {
          this.walkerPaused = !this.walkerPaused;
        },
      },
      controls: {
        paint: choice('Click paints', ['goal', 'wall', 'mud']),
        pruning: toggle('Jump-point pruning', true),
        scenario: choice('Scenario', ['room', 'smooth', '2x2 agent', 'no diagonals', 'all diagonals']),
      },
      onChange: (key, value) => {
        switch (key) {
          case 'paint':
            this.paint = value as PaintMode;

            return;
          case 'pruning':
            this.pruning = value as boolean;
            break;
          case 'scenario': {
            this.smooth = value === 'smooth';
            this.agentSize = value === '2x2 agent' ? 2 : 1;
            const policy = value === 'no diagonals' ? 'never' : value === 'all diagonals' ? 'always' : 'no-corner-cutting';
            // The diagonal policy is fixed at construction, so changing it
            // rebuilds the window from the costs the current one holds.
            const previous = this.grid;

            this.grid = GridSpace.from(COLUMNS, ROWS, (x, y) => previous.costAt(x, y), {
              cellSize: CELL,
              diagonals: policy,
            });
            this.diagonals = policy;
            break;
          }
        }

        this.replan();
      },
    });

    this.drawTerrain();
    this.replan();
  }

  override update(delta: Seconds): void {
    const fit = this.panel?.fit(this.app, this.app.canvas as HTMLCanvasElement);
    const scale = Math.min(1, ((fit?.contentHeight ?? 720) * (fit?.scale ?? 1)) / (ROWS * CELL));
    this.worldRoot.setScale(scale).setPosition((this.app.width - COLUMNS * CELL * scale) / 2, 0);

    if (this.walkerPaused) {
      return;
    }

    const points = this.result?.points ?? [];

    if (this.waypoint >= points.length) {
      return;
    }

    let travel = AGENT_SPEED * delta;

    while (travel > 0 && this.waypoint < points.length) {
      const target = points[this.waypoint]!;
      const distance = Math.hypot(target.x - this.agent.x, target.y - this.agent.y);

      if (distance <= travel) {
        this.agent.x = target.x;
        this.agent.y = target.y;
        travel -= distance;
        this.waypoint++;
        continue;
      }

      this.agent.x += ((target.x - this.agent.x) / distance) * travel;
      this.agent.y += ((target.y - this.agent.y) / distance) * travel;
      travel = 0;
    }
  }

  override draw(context: RenderingContext): void {
    this.overlay.clear();

    const points = this.result?.points ?? [];

    if (points.length > 1) {
      this.overlay.lineWidth = (3 * (this.panel?.fit(this.app, this.app.canvas as HTMLCanvasElement).scale ?? 1)) / this.worldRoot.scale.x;
      this.overlay.lineColor = PATH_COLOR;

      for (let index = 1; index < points.length; index++) {
        this.overlay.drawLine(points[index - 1]!.x, points[index - 1]!.y, points[index]!.x, points[index]!.y);
      }
    }

    this.overlay.fillColor = GOAL_COLOR;
    this.overlay.drawCircle((this.goal.x + 0.5) * CELL, (this.goal.y + 0.5) * CELL, 8);
    this.overlay.fillColor = AGENT_COLOR;
    this.overlay.drawCircle(this.agent.x, this.agent.y, 4 + this.agentSize * 4);

    context.render(this.worldRoot);
  }

  private applyPaint(screenX: number, screenY: number): void {
    const x = Math.floor((screenX - this.worldRoot.x) / this.worldRoot.scale.x / CELL);
    const y = Math.floor((screenY - this.worldRoot.y) / this.worldRoot.scale.y / CELL);

    if (this.grid.nodeAt(x, y) < 0) {
      return;
    }

    if (this.paint === 'goal') {
      this.goal = { x, y };
    } else {
      const painted = this.paint === 'wall' ? 0 : MUD_COST;

      this.grid.setCost(x, y, this.grid.costAt(x, y) === painted ? 1 : painted);
      this.drawTerrain();
    }

    this.replan();
  }

  private replan(): void {
    // Replanning starts from the cell the walker currently stands in, not from
    // the previous path's start: it is usually somewhere between two cells.
    this.result = this.pathfinder.findPathBetween(
      this.grid,
      this.agent.x,
      this.agent.y,
      (this.goal.x + 0.5) * CELL,
      (this.goal.y + 0.5) * CELL,
      {
        smooth: this.smooth,
        pruning: this.pruning,
        agentSize: this.agentSize,
        snapToNearest: true,
      },
    );
    this.waypoint = 0;

    const { status, cost, nodes, expandedNodes } = this.result;
    const pruned = this.pruning && this.grid.pruning(this.agentSize) !== null;

    this.panel?.status(
      `${status} · cost ${cost.toFixed(1)} · ${nodes.length} waypoints · ${expandedNodes} nodes expanded · ${pruned ? 'jump-point' : 'plain A*'}`,
    );
  }

  override destroy(): void {
    this.app.input.onPointerTap.remove(this.onTap);
    this.worldRoot.removeChildren();
    this.worldRoot.destroy();
    this.terrain.destroy();
    this.overlay.destroy();
    this.panel?.dispose();
    super.destroy();
  }

  private drawTerrain(): void {
    this.terrain.clear();

    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLUMNS; x++) {
        const cost = this.grid.costAt(x, y);

        if (cost === 0) {
          this.terrain.fillColor = WALL_COLOR;
        } else if (cost > 1) {
          this.terrain.fillColor = MUD_COLOR;
        } else {
          this.terrain.fillColor = FLOOR_COLOR;
        }

        this.terrain.drawRectangle(x * CELL + 1, y * CELL + 1, CELL - 2, CELL - 2);
      }
    }
  }
}

const app = new Application({
  scenes: { GridNavigationScene },
  canvas: {
    width: 1280,
    height: 720,
    mount: document.body,
    sizing: new FixedResolutionCanvasSizing(),
  },
  clearColor: new Color(12, 14, 20),
});

await startExample(app, () => app.start(GridNavigationScene));
