import { Application, Color, FixedResolutionCanvasSizing, Keyboard, ScaleModes, Scene, Sprite, Text, Texture } from '@codexo/exojs';
import { demoAssets as assets } from '@codexo/exojs-demo-assets';
import { startExample } from '@examples/runtime';

const source = assets.pixelGrid128.source;

const report = (scene: Scene): string => {
  const row = scene.app.loader.inspect().find(asset => asset.aliases.includes(source));
  const owners = row?.owners.map(owner => owner.kind).join(', ') ?? 'none';

  return `${row?.state ?? 'not requested'} | claims: ${row?.claims ?? 0} | owners: ${owners}`;
};

// #region guide:shared-texture
class FirstScene extends Scene {
  private readonly status = this.track(new Text('', { fillColor: Color.white, fontSize: 24 }));

  override init(): void {
    // Two textures name one file. They share one decoded image and keep their own sampler.
    const crisp = new Sprite(new Texture(source, { scaleMode: ScaleModes.Nearest }));
    const smooth = new Sprite(new Texture(source, { scaleMode: ScaleModes.Linear }));

    crisp
      .setAnchor(0.5)
      .setScale(3)
      .setPosition(this.app.width * 0.3, 400);
    smooth
      .setAnchor(0.5)
      .setScale(3)
      .setPosition(this.app.width * 0.7, 400);
    this.status.setPosition(80, 60);
    this.root.addChild(crisp, smooth, this.status);
    this.inputs.onTrigger(Keyboard.Space, () => {
      void this.app.scenes.change(SecondScene);
    });
  }

  override update(): void {
    this.status.text = `First scene (Space: switch)\n${report(this)}`;
  }
}

class SecondScene extends Scene {
  private readonly status = this.track(new Text('', { fillColor: Color.white, fontSize: 24 }));

  override init(): void {
    // The first scene has ended and released its claims; this scene's own claim keeps the image resident.
    const sprite = new Sprite(source)
      .setAnchor(0.5)
      .setScale(3)
      .setPosition(this.app.width / 2, 400);

    this.status.setPosition(80, 60);
    this.root.addChild(sprite, this.status);
    this.inputs.onTrigger(Keyboard.Space, () => {
      void this.app.scenes.change(FirstScene);
    });
  }

  override update(): void {
    this.status.text = `Second scene (Space: switch)\n${report(this)}`;
  }
}
// #endregion guide:shared-texture

const app = new Application({
  scenes: { FirstScene, SecondScene },
  canvas: { width: 1280, height: 720, mount: document.body, sizing: new FixedResolutionCanvasSizing() },
  clearColor: new Color(18, 24, 29),
});

await startExample(app, () => app.start(FirstScene));
