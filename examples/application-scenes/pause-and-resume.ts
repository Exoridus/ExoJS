import {
  Application,
  Color,
  FixedResolutionCanvasSizing,
  Keyboard,
  Scene,
  SceneAvailability,
  type Seconds,
  Sprite,
  Text,
} from '@codexo/exojs';

class PauseResumeScene extends Scene {
  private sprite!: Sprite;
  private label!: Text;

  override init(): void {
    const app = this.app;
    const { width, height } = app;

    this.sprite = new Sprite(this.loader.get('image/ship-a.png'));
    this.sprite.setAnchor(0.5);
    this.sprite.setPosition(width / 2, height / 2);

    this.label = new Text('Space or click: pause update', { fillColor: Color.white, fontSize: 16 });
    this.label.setAnchor(0.5, 0);
    this.label.setPosition(width / 2, 16);
    this.addChild(this.sprite);
    this.addChild(this.label);

    // A scene binding fires only while the scene is active unless told
    // otherwise; the key that resumes has to work while it is paused too.
    this.inputs.onTrigger(Keyboard.Space, () => this.toggle(), { when: SceneAvailability.Always });

    // Same toggle on click/tap so the pause works without a keyboard. A global
    // signal, so the scene removes its listener when it ends.
    app.input.onPointerTap.add(this.onTap);
    this.track({ destroy: () => app.input.onPointerTap.remove(this.onTap) });
  }

  private readonly onTap = (): void => this.toggle();

  private toggle(): void {
    if (this.app.scenes.paused) {
      this.app.scenes.resume();
    } else {
      this.app.scenes.pause();
    }

    this.label.text = this.app.scenes.paused ? 'Paused (draw running)' : 'Running';
  }

  override update(delta: Seconds): void {
    this.sprite.rotate(delta * 180);
  }
}

const app = new Application({
  scenes: { PauseResumeScene },
  canvas: {
    width: 1280,
    height: 720,
    mount: document.body,
    sizing: new FixedResolutionCanvasSizing(),
  },
  clearColor: Color.black,
  loader: {
    basePath: 'assets/',
  },
});

await app.start(PauseResumeScene);
