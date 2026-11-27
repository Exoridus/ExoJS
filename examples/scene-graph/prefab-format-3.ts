import { Application, Color, FixedResolutionCanvasSizing, Prefab, Scene, Sprite, Text, Texture } from '@codexo/exojs';
import { demoAssets as assets } from '@codexo/exojs-demo-assets';
import { startExample } from '@examples/runtime';

const source = assets.spaceShipBlue.source;

// A saved document with a typed texture reference.
const savedDocument = {
  version: 4,
  root: { type: 'Sprite', x: 0, y: 0, anchorX: 0.5, anchorY: 0.5, texture: { $type: 'texture', source } },
};

class PrefabScene extends Scene {
  private readonly status = this.track(new Text('', { fillColor: Color.white, fontSize: 22 }));

  override async load(): Promise<void> {
    // Preload the texture so either sprite can draw immediately.
    await this.assets.load(new Texture(source));
  }

  override init(): void {
    // #region guide:prefab-format-3
    // Capture a configured sprite. The saved texture is a typed reference.
    const template = new Sprite(source).setAnchor(0.5);
    const current = Prefab.from(template, this.app.loader).toJSON();

    // Both the captured and saved document instantiate the same way.
    const fromCurrent = Prefab.fromJSON(current).instantiate(this.app.loader) as Sprite;
    const fromSaved = Prefab.fromJSON(savedDocument).instantiate(this.app.loader) as Sprite;
    // #endregion guide:prefab-format-3

    fromCurrent.setPosition(this.app.width * 0.3, 580);
    fromSaved.setPosition(this.app.width * 0.7, 580);
    this.status.setPosition(60, 40);
    this.status.text = `Saved document, version ${current.version}:\n${JSON.stringify(current.root, null, 1)}\n\nLeft: instantiated from it.   Right: from a saved format 4 document.`;
    this.root.addChild(fromCurrent, fromSaved, this.status);
  }
}

const app = new Application({
  scenes: { PrefabScene },
  canvas: { width: 1280, height: 720, mount: document.body, sizing: new FixedResolutionCanvasSizing() },
  clearColor: new Color(18, 24, 29),
});

await startExample(app, () => app.start(PrefabScene));
