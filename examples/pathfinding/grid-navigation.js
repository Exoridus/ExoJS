// Auto-generated from grid-navigation.ts - edit the .ts source, not this file.
import { Application, Color, FixedResolutionCanvasSizing, Graphics, Scene } from '@codexo/exojs';
import { GridSpace, Pathfinder } from '@codexo/exojs-pathfinding';
import { mountControlPanel, mountControls } from '@examples/runtime';
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
const PATH_COLOR = new Color(90, 200, 255);
const GOAL_COLOR = new Color(255, 170, 80);
const AGENT_COLOR = new Color(240, 245, 255);
/** Deterministic room-and-pillar layout, so the example looks the same every run. */
const initialCost = (x, y) => {
  if (x === 0 || y === 0 || x === COLUMNS - 1 || y === ROWS - 1) return 0;
  if (x % 8 === 4 && y % 3 !== 1) return 0;
  if (x % 4 === 2 && y % 6 === 3) return 0;
  return 1;
};
class GridNavigationScene extends Scene {
  grid = GridSpace.from(COLUMNS, ROWS, initialCost, { cellSize: CELL });
  pathfinder = new Pathfinder();
  terrain = new Graphics();
  overlay = new Graphics();
  result = null;
  goal = { x: COLUMNS - 3, y: ROWS - 3 };
  agent = { x: 2.5 * CELL, y: 2.5 * CELL };
  waypoint = 0;
  paint = 'goal';
  smooth = false;
  pruning = true;
  agentSize = 1;
  diagonals = 'no-corner-cutting';
  hud;
  init() {
    this.app.input.onPointerTap.add(pointer => this.applyPaint(pointer.x, pointer.y));
    this.hud = mountControls({
      title: 'Grid Navigation',
      controls: [
        { keys: 'Click', action: 'set the goal (or paint, see panel)' },
        { keys: 'panel', action: 'pruning / smoothing / agent size' },
      ],
      status: '',
      hint: 'Painting mud makes the grid non-uniform, which turns jump-point pruning off by itself — the expanded-node counter jumps.',
    });
    const panel = mountControlPanel({ title: 'Pathfinding' });
    panel.addCycle({
      label: 'Click paints',
      options: ['goal', 'wall', 'mud'],
      index: 0,
      onChange: (_index, value) => (this.paint = value),
    });
    panel.addToggle({ label: 'Jump-point pruning', value: true, onChange: value => this.replan(() => (this.pruning = value)) });
    panel.addToggle({ label: 'Smooth path', value: false, onChange: value => this.replan(() => (this.smooth = value)) });
    panel.addToggle({ label: '2x2 agent', value: false, onChange: value => this.replan(() => (this.agentSize = value ? 2 : 1)) });
    panel.addCycle({
      label: 'Diagonals',
      options: ['no-corner-cutting', 'never', 'always'],
      index: 0,
      // The diagonal policy is fixed at construction, so changing it rebuilds
      // the window from the costs the current one holds.
      onChange: (_index, value) => {
        const previous = this.grid;
        this.grid = GridSpace.from(COLUMNS, ROWS, (x, y) => previous.costAt(x, y), { cellSize: CELL, diagonals: value });
        this.diagonals = value;
        this.replan();
      },
    });
    this.drawTerrain();
    this.replan();
  }
  update(delta) {
    const points = this.result?.points ?? [];
    if (this.waypoint >= points.length) return;
    let travel = AGENT_SPEED * delta;
    while (travel > 0 && this.waypoint < points.length) {
      const target = points[this.waypoint];
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
  draw(context) {
    this.overlay.clear();
    const points = this.result?.points ?? [];
    if (points.length > 1) {
      this.overlay.lineWidth = 4;
      this.overlay.lineColor = PATH_COLOR;
      for (let index = 1; index < points.length; index++) {
        this.overlay.drawLine(points[index - 1].x, points[index - 1].y, points[index].x, points[index].y);
      }
    }
    this.overlay.fillColor = GOAL_COLOR;
    this.overlay.drawCircle((this.goal.x + 0.5) * CELL, (this.goal.y + 0.5) * CELL, 8);
    this.overlay.fillColor = AGENT_COLOR;
    this.overlay.drawCircle(this.agent.x, this.agent.y, 4 + this.agentSize * 4);
    context.render(this.terrain);
    context.render(this.overlay);
  }
  applyPaint(screenX, screenY) {
    const x = Math.floor(screenX / CELL);
    const y = Math.floor(screenY / CELL);
    if (this.grid.nodeAt(x, y) < 0) return;
    if (this.paint === 'goal') {
      this.goal = { x, y };
    } else {
      const painted = this.paint === 'wall' ? 0 : MUD_COST;
      this.grid.setCost(x, y, this.grid.costAt(x, y) === painted ? 1 : painted);
      this.drawTerrain();
    }
    this.replan();
  }
  replan(mutate) {
    mutate?.();
    // The agent is somewhere between two cells, so the query starts from the
    // cell it currently stands in rather than from the previous path's start.
    this.result = this.pathfinder.findPathBetween(this.grid, this.agent.x, this.agent.y, (this.goal.x + 0.5) * CELL, (this.goal.y + 0.5) * CELL, {
      smooth: this.smooth,
      pruning: this.pruning,
      agentSize: this.agentSize,
      snapToNearest: true,
    });
    this.waypoint = 0;
    const { status, cost, nodes, expandedNodes } = this.result;
    const pruned = this.pruning && this.grid.pruning(this.agentSize) !== null;
    this.hud.setStatus(
      `${status} · cost ${cost.toFixed(1)} · ${nodes.length} waypoints · ${expandedNodes} nodes expanded · ${pruned ? 'jump-point' : 'plain A*'} · ${this.diagonals}`,
    );
  }
  drawTerrain() {
    this.terrain.clear();
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLUMNS; x++) {
        const cost = this.grid.costAt(x, y);
        if (cost === 0) this.terrain.fillColor = WALL_COLOR;
        else if (cost > 1) this.terrain.fillColor = MUD_COLOR;
        else this.terrain.fillColor = FLOOR_COLOR;
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
await app.start(GridNavigationScene);
