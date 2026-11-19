import { Application, Color, FixedResolutionCanvasSizing, Prefab, Scene, Sprite, Text, Texture } from '@codexo/exojs';
import { demoAssets as assets } from '@codexo/exojs-demo-assets';
import { startExample } from '@examples/runtime';

const source = assets.spaceShipBlue.source;

// An older document: the texture is a plain `{ source, options }` object.
const legacyDocument = {
  version: 2,
  root: { type: 'Sprite', x: 0, y: 0, anchorX: 0.5, anchorY: 0.5, texture: { source, options: {} } },
};

class PrefabScene extends Scene {
  private readonly status = this.track(new Text('', { fillColor: Color.white, fontSize: 22 }));

  override async load(): Promise<void> {
    // A version 2 texture reference is resolved from what the loader already holds.
    await this.assets.load(new Texture(source));
  }

  override init(): void {
    // #region guide:prefab-format-3
    // Capture a configured sprite. The saved texture is a typed reference.
    const template = new Sprite(source).setAnchor(0.5);
    const current = Prefab.from(template, this.app.loader).toJSON();

    // Documents written by earlier versions still read, and both forms instantiate the same way.
    const fromCurrent = Prefab.fromJSON(current).instantiate(this.app.loader) as Sprite;
    const fromLegacy = Prefab.fromJSON(legacyDocument).instantiate(this.app.loader) as Sprite;
    // #endregion guide:prefab-format-3

    fromCurrent.setPosition(this.app.width * 0.3, 580);
    fromLegacy.setPosition(this.app.width * 0.7, 580);
    this.status.setPosition(60, 40);
    this.status.text = `Saved document, version ${current.version}:\n${JSON.stringify(current.root, null, 1)}\n\nLeft: instantiated from it.   Right: from a version 2 document.`;
    this.root.addChild(fromCurrent, fromLegacy, this.status);
  }
}

const app = new Application({
  scenes: { PrefabScene },
  canvas: { width: 1280, height: 720, mount: document.body, sizing: new FixedResolutionCanvasSizing() },
  clearColor: new Color(18, 24, 29),
});

await startExample(app, () => app.start(PrefabScene));
