/** @jsxImportSource @codexo/exojs */
/**
 * The same hierarchy built once with JSX and once with constructors, rendered
 * by a real application, shared by the WebGL2 and WebGPU specs. JSX only
 * constructs: the two trees must render the same pixels with the same draw
 * calls and node count.
 */
import { Application } from '#core/Application';
import { Color } from '#core/Color';
import { Scene } from '#core/scene/Scene';
import { Container } from '#rendering/Container';
import { Graphics } from '#rendering/primitives/Graphics';
import type { RenderNode } from '#rendering/RenderNode';
import { Sprite } from '#rendering/sprite/Sprite';
import { Texture } from '#rendering/texture/Texture';
import { Button } from '#ui/Button';
import { Label } from '#ui/Label';
import { Panel } from '#ui/Panel';
import { Stack } from '#ui/Stack';

const size = 128;

const drawGround = (ground: Graphics): void => {
  ground.fillColor = Color.blue;
  ground.drawRectangle(0, 30, 30, 20);
};

interface Palette {
  readonly red: Texture;
  readonly green: Texture;
}

const declared = ({ red, green }: Palette): RenderNode => (
  <Container name="root">
    <Sprite texture={red} x={8} y={8} scale={{ x: 40, y: 20 }} />
    <Container x={64} y={8} rotation={15}>
      <Sprite texture={green} scale={24} anchor={0.5} tint={Color.yellow} />
      <Graphics ref={drawGround} />
    </Container>
    <Panel width={70} height={56} x={8} y={60}>
      <Stack spacing={4} padding={4}>
        <Label text="JSX" />
        <Button label="OK" width={56} height={20} />
      </Stack>
    </Panel>
  </Container>
);

const imperative = ({ red, green }: Palette): RenderNode => {
  const root = new Container();
  root.name = 'root';

  const banner = new Sprite(red);
  banner.setPosition(8, 8);
  banner.setScale(40, 20);

  const group = new Container();
  group.setPosition(64, 8);
  group.rotation = 15;

  const gem = new Sprite(green);
  gem.setScale(24);
  gem.anchor.set(0.5, 0.5);
  gem.tint = Color.yellow;

  const ground = new Graphics();
  drawGround(ground);
  group.addChild(gem, ground);

  const panel = new Panel({ width: 70, height: 56 });
  panel.setPosition(8, 60);
  const stack = new Stack({ spacing: 4, padding: 4 });
  stack.addChild(new Label('JSX'), new Button({ label: 'OK', width: 56, height: 20 }));
  panel.addChild(stack);

  root.addChild(banner, group, panel);

  return root;
};

const countNodes = (node: RenderNode): number =>
  1 + (node instanceof Container ? node.children.reduce((sum, child) => sum + countNodes(child), 0) : 0);

const nextFrames = async (count: number): Promise<void> => {
  for (let i = 0; i < count; i++) {
    await new Promise(resolve => requestAnimationFrame(resolve));
  }
};

export interface JsxCompositionMeasure {
  readonly pixels: Uint8ClampedArray;
  readonly drawCalls: number;
  readonly nodes: number;
}

export interface JsxCompositionResult {
  readonly declared: JsxCompositionMeasure;
  readonly imperative: JsxCompositionMeasure;
  readonly errors: readonly string[];
}

/**
 * Render both trees on `backend` and measure each. On WebGPU, a browser without
 * an adapter, or one where the backend cannot be created, skips through `ctx`.
 */
export const runJsxComposition = async (
  backend: 'webgl2' | 'webgpu',
  ctx: { skip: (reason: string) => void },
): Promise<JsxCompositionResult> => {
  if (backend === 'webgpu' && (!('gpu' in navigator) || (await navigator.gpu.requestAdapter()) === null)) {
    ctx.skip('No WebGPU adapter is available in this browser.');
  }

  const palette: Palette = { red: Texture.fromColor(Color.red, 1), green: Texture.fromColor(Color.green, 1) };
  let build: (palette: Palette) => RenderNode = declared;

  class CompositionScene extends Scene {
    public tree: RenderNode | null = null;

    public override init(): void {
      this.tree = build(palette);
      this.addChild(this.tree);
    }
  }

  class OtherCompositionScene extends CompositionScene {}

  const container = document.createElement('div');
  const errors: string[] = [];
  document.body.appendChild(container);

  const app = new Application({
    hello: false,
    scenes: { CompositionScene, OtherCompositionScene },
    canvas: { width: size, height: size, pixelRatio: 1, mount: container },
    clearColor: Color.black,
    backend: { type: backend },
  } as ConstructorParameters<typeof Application>[0]);

  app.onError.add(error => errors.push(`app.onError: ${error.message}`));

  const measure = async (): Promise<JsxCompositionMeasure> => {
    await nextFrames(4);

    const drawCalls = app.rendering.stats.drawCalls;
    const scene = app.scenes.currentScene as CompositionScene;
    const target = app.backend.acquireRenderTexture(size, size);

    try {
      app.rendering._renderSurfaceInto(target, Color.black, () => app.scenes.draw(app.rendering));
      app.backend.flush();

      return { pixels: await app.backend.readPixels(target, 0, 0, size, size), drawCalls, nodes: countNodes(scene.tree!) };
    } finally {
      app.backend.releaseRenderTexture(target);
    }
  };

  try {
    try {
      await app.start(CompositionScene);
    } catch (error) {
      if (backend === 'webgpu') {
        ctx.skip(`The WebGPU backend could not be created in this browser: ${String(error)}`);
      }

      throw error;
    }

    const declaredMeasure = await measure();

    build = imperative;
    await app.scenes.change(OtherCompositionScene);

    return { declared: declaredMeasure, imperative: await measure(), errors };
  } finally {
    await app.destroy();
    container.remove();
  }
};
