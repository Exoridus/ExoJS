// Auto-generated from mini-map.ts - edit the .ts source, not this file.
import {
  ActionMap,
  Application,
  clamp,
  Color,
  Container,
  FixedResolutionCanvasSizing,
  GamepadAxis,
  Graphics,
  Keyboard,
  RenderNodePass,
  RenderPipeline,
  RenderTexture,
  Scene,
  Sprite,
  VectorAction,
  View,
} from '@codexo/exojs';
import { demoPanel, startExample } from '@examples/runtime';
const WORLD_WIDTH = 3200;
const WORLD_HEIGHT = 1800;
const MAP_SIZE = 200;
const MAP_RADIUS = 92;
const MAP_SPAN = 1600;
const LANDMARKS = [
  { x: 360, y: 280, width: 420, height: 260, color: new Color(84, 160, 96) },
  { x: 1300, y: 180, width: 300, height: 520, color: new Color(196, 142, 78) },
  { x: 2250, y: 360, width: 560, height: 300, color: new Color(152, 96, 186) },
  { x: 520, y: 1080, width: 380, height: 420, color: new Color(206, 88, 88) },
  { x: 1620, y: 1150, width: 620, height: 240, color: new Color(70, 170, 190) },
  { x: 2620, y: 1180, width: 280, height: 380, color: new Color(220, 200, 90) },
];
const buildWorld = () => {
  const ground = new Graphics();
  ground.fillColor = new Color(38, 58, 92);
  ground.drawRectangle(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
  ground.lineWidth = 2;
  ground.lineColor = new Color(62, 86, 124);
  for (let x = 0; x <= WORLD_WIDTH; x += 100) {
    ground.drawLine(x, 0, x, WORLD_HEIGHT);
  }
  for (let y = 0; y <= WORLD_HEIGHT; y += 100) {
    ground.drawLine(0, y, WORLD_WIDTH, y);
  }
  for (const { x, y, width, height, color } of LANDMARKS) {
    ground.fillColor = color;
    ground.drawRoundedRectangle(x, y, width, height, 24);
  }
  return ground;
};
/**
 * One world, two cameras. The main pass and the minimap pass render the same
 * container, each through its own View; nothing in the minimap is drawn or
 * positioned separately.
 */
class MiniMapScene extends Scene {
  world = new Container();
  player = new Graphics();
  overlay = new Container();
  mask = new Graphics();
  camera;
  mapCamera;
  mapTexture;
  pipeline;
  actions = new ActionMap({
    move: new VectorAction([
      {
        up: [Keyboard.W, Keyboard.Up],
        down: [Keyboard.S, Keyboard.Down],
        left: [Keyboard.A, Keyboard.Left],
        right: [Keyboard.D, Keyboard.Right],
      },
      { x: GamepadAxis.LeftStickX, y: GamepadAxis.LeftStickY },
    ]),
  });
  panel;
  mapLayout = '';
  map;
  frame;
  init() {
    const { width, height } = this.app;
    const mapX = width - MAP_SIZE - 20;
    const mapY = 20;
    this.player.fillColor = new Color(255, 180, 100);
    this.player.drawCircle(0, 0, 28);
    this.world.addChild(buildWorld());
    this.world.addChild(this.player);
    this.camera = new View(0, 0, width, height);
    this.mapCamera = new View(0, 0, MAP_SPAN, MAP_SPAN);
    this.mapTexture = new RenderTexture(MAP_SIZE, MAP_SIZE);
    const map = (this.map = new Sprite(this.mapTexture).setPosition(mapX, mapY));
    const frame = (this.frame = new Graphics());
    this.mask.fillColor = Color.white;
    this.mask.drawCircle(mapX + MAP_SIZE / 2, mapY + MAP_SIZE / 2, MAP_RADIUS);
    map.mask = this.mask;
    frame.lineWidth = 3;
    frame.lineColor = Color.white;
    frame.drawCircle(mapX + MAP_SIZE / 2, mapY + MAP_SIZE / 2, MAP_RADIUS);
    this.overlay.addChild(map);
    this.overlay.addChild(frame);
    // Each render-target pass owns its clear; a manual backend clear would
    // clear the canvas instead.
    this.pipeline = new RenderPipeline()
      .addPass(new RenderNodePass(this.world, { target: this.mapTexture, view: this.mapCamera, clear: Color.black }))
      .addPass(new RenderNodePass(this.world, { view: this.camera, clear: Color.black }))
      .addPass(new RenderNodePass(this.overlay));
    this.player.setPosition(WORLD_WIDTH / 2, WORLD_HEIGHT / 2);
    this.inputs.attach(this.actions);
    this.panel = demoPanel({
      scene: this,
      layout: 'bar',
      title: 'Minimap',
      controls: {},
      hint: 'WASD / arrows / stick move. One world renders through two cameras; the circular HUD uses a render texture.',
      actions: { Reset: () => this.player.setPosition(WORLD_WIDTH / 2, WORLD_HEIGHT / 2) },
    });
  }
  update(delta) {
    const fit = this.panel.fit(this.app, this.app.canvas);
    const input = this.actions.move.value;
    const x = clamp(this.player.x + input.x * 320 * delta, 28, WORLD_WIDTH - 28);
    const y = clamp(this.player.y + input.y * 320 * delta, 28, WORLD_HEIGHT - 28);
    const { width, height } = this.app;
    const mapScale = Math.min(1.5, fit.scale);
    const mapX = width - (MAP_SIZE + 16) * mapScale;
    const mapLayout = `${mapScale}:${mapX}`;
    if (mapLayout !== this.mapLayout) {
      this.mapLayout = mapLayout;
      this.map.setScale(mapScale).setPosition(mapX, 16 * mapScale);
      this.frame.clear();
      this.frame.lineWidth = 2 * fit.scale;
      this.frame.lineColor = Color.white;
      this.frame.drawCircle(mapX + (MAP_SIZE / 2) * mapScale, (16 + MAP_SIZE / 2) * mapScale, MAP_RADIUS * mapScale);
      this.mask.clear();
      this.mask.fillColor = Color.white;
      this.mask.drawCircle(mapX + (MAP_SIZE / 2) * mapScale, (16 + MAP_SIZE / 2) * mapScale, MAP_RADIUS * mapScale);
    }
    this.player.setPosition(x, y);
    this.camera.setCenter(clamp(x, width / 2, WORLD_WIDTH - width / 2), clamp(y, height / 2, WORLD_HEIGHT - height / 2));
    this.panel.status(`Player ${x.toFixed(0)}, ${y.toFixed(0)} | Minimap follows the same world`);
    this.mapCamera.setCenter(x, y);
  }
  draw(context) {
    this.pipeline.execute(context);
  }
  destroy() {
    // The pipeline destroys its passes; the target, views and nodes they
    // render stay caller-owned.
    this.panel.dispose();
    this.pipeline.destroy();
    this.mapTexture.destroy();
    this.camera.destroy();
    this.mapCamera.destroy();
    this.world.destroy();
    this.overlay.destroy();
    this.mask.destroy();
    super.destroy();
  }
}
const app = new Application({
  scenes: { MiniMapScene },
  canvas: {
    width: 1280,
    height: 720,
    mount: document.body,
    sizing: new FixedResolutionCanvasSizing(),
  },
  clearColor: Color.black,
});
await startExample(app, () => app.start(MiniMapScene));
