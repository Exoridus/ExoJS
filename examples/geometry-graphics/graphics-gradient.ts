import {
  Application,
  Color,
  FixedResolutionCanvasSizing,
  Graphics,
  LinearGradient,
  RadialGradient,
  type RenderingContext,
  Scene,
  Text,
} from '@codexo/exojs';
import { choice, demoPanel, startExample } from '@examples/runtime';

const controls = { gradient: choice('Gradient', ['Linear', 'Radial']) };
const stops = [
  { offset: 0, color: new Color(136, 233, 126) },
  { offset: 1, color: new Color(101, 160, 210) },
];

class GraphicsGradientScene extends Scene {
  private readonly graphics = this.track(new Graphics());
  private readonly labels = ['Rectangle', 'Circle', 'Polygon', 'Arc', 'Star', 'Gradient'].map(text =>
    this.track(new Text(text, { fillColor: new Color(35, 63, 59), align: 'center' })).setAnchor(0.5, 0),
  );
  private readonly handles = [document.createElement('button'), document.createElement('button')];
  private points: Array<[number, number]> = [
    [0.15, 0.3],
    [0.85, 0.7],
  ];
  private box = { x: 0, y: 0, width: 1, height: 1 };
  private panel!: ReturnType<typeof demoPanel<typeof controls>>;
  private dirty = true;
  private size = '';

  override init(): void {
    this.panel = demoPanel({
      scene: this,
      layout: 'bar',
      controls,
      onChange: () => {
        this.dirty = true;
      },
    });
    this.handles.forEach((handle, index) => {
      handle.textContent = index === 0 ? 'A' : 'B';
      handle.setAttribute('aria-label', index === 0 ? 'Gradient start' : 'Gradient end');
      Object.assign(handle.style, {
        position: 'fixed',
        width: '32px',
        height: '32px',
        padding: '0',
        zIndex: '2',
        background: '#88e97e',
        color: '#233f3b',
        border: '2px solid #23643c',
        borderRadius: '50%',
        cursor: 'move',
        touchAction: 'none',
        transformOrigin: 'top left',
        font: 'bold 14px system-ui',
      });
      handle.addEventListener('pointerdown', event => handle.setPointerCapture(event.pointerId));
      handle.addEventListener('pointermove', event => {
        if (handle.hasPointerCapture(event.pointerId)) {
          const canvas = this.app.canvas as HTMLCanvasElement;
          const rect = canvas.getBoundingClientRect();
          const x = ((event.clientX - rect.left) * this.app.width) / rect.width;
          const y = ((event.clientY - rect.top) * this.app.height) / rect.height;

          this.points[index] = [
            Math.max(0, Math.min(1, (x - this.box.x) / this.box.width)),
            Math.max(0, Math.min(1, (y - this.box.y) / this.box.height)),
          ];
          this.dirty = true;
        }
      });
      handle.addEventListener('keydown', event => {
        if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
          event.preventDefault();
          const point = this.points[index]!;
          const axis = event.key === 'ArrowLeft' || event.key === 'ArrowRight' ? 0 : 1;

          point[axis] = Math.max(0, Math.min(1, point[axis]! + (event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -0.05 : 0.05)));
          this.dirty = true;
        }
      });
      document.body.append(handle);
    });
  }

  override update(): void {
    const { scale: k, width, contentHeight } = this.panel.fit(this.app, this.app.canvas as HTMLCanvasElement);
    const size = `${width}/${contentHeight}/${k}`;

    if (!this.dirty && this.size === size) {
      return;
    }

    this.size = size;
    this.dirty = false;
    const g = this.graphics;
    const cellW = (width - 32) / 3;
    const cellH = Math.max(48, (contentHeight - 12) / 2);
    const radius = Math.min(cellW * 0.32, Math.max(12, (cellH - 28) * 0.45)) * k;

    g.clear();
    g.lineWidth = 2 * k;
    g.lineColor = new Color(35, 63, 59);
    g.fillColor = new Color(185, 219, 210);

    for (let index = 0; index < 6; index++) {
      const x = (16 + cellW * ((index % 3) + 0.5)) * k;
      const y = (cellH * (Math.floor(index / 3) + 0.5) - 6) * k;
      const label = this.labels[index]!;

      label.style.fontSize = 14 * k;
      label.setPosition(x, y + radius + 5 * k);

      if (index === 0) {
        g.drawRectangle(x - radius, y - radius, radius * 2, radius * 2);
      }

      if (index === 1) {
        g.drawCircle(x, y, radius);
      }

      if (index === 2) {
        g.drawPolygon([x, y - radius, x + radius, y + radius, x - radius, y + radius]);
      }

      if (index === 3) {
        g.drawArc(x, y, radius, Math.PI * 0.15, Math.PI * 1.7);
      }

      if (index === 4) {
        g.drawStar(x, y, 5, radius, radius * 0.45);
      }

      if (index === 5) {
        const [a, b] = this.points as [[number, number], [number, number]];

        this.box = { x: x - cellW * 0.4 * k, y: y - radius, width: cellW * 0.8 * k, height: radius * 2 };
        g.fillStyle =
          this.panel.values.gradient === 'Linear'
            ? new LinearGradient(stops, a, b)
            : new RadialGradient(stops, a, Math.max(0.02, Math.hypot(b[0] - a[0], b[1] - a[1])));
        g.drawRectangle(this.box.x, this.box.y, this.box.width, this.box.height);
      }
    }

    this.handles.forEach((handle, index) => {
      const point = this.points[index]!;

      handle.style.left = `${this.box.x + point[0] * this.box.width - 16 * k}px`;
      handle.style.top = `${this.box.y + point[1] * this.box.height - 16 * k}px`;
      handle.style.transform = `scale(${k})`;
    });
    this.panel.status(
      `${this.panel.values.gradient} | A ${this.points[0]!.map(v => v.toFixed(2)).join(', ')} | B ${this.points[1]!.map(v => v.toFixed(2)).join(', ')}`,
    );
  }

  override draw(context: RenderingContext): void {
    context.render(this.graphics);
    this.labels.forEach(label => context.render(label));
  }

  override destroy(): void {
    this.handles.forEach(handle => handle.remove());
    this.panel?.dispose();
    super.destroy();
  }
}

const app = new Application({
  scenes: { GraphicsGradientScene },
  canvas: { width: 1280, height: 720, mount: document.body, sizing: new FixedResolutionCanvasSizing() },
  clearColor: new Color(242, 244, 239),
});

await startExample(app, () => app.start(GraphicsGradientScene));
