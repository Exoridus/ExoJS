import { Color, Container, Graphics, Scene, Sprite, Text, type Texture } from '@codexo/exojs';
import { LightmapLighting, PointLight } from '@codexo/exojs/lighting';

declare const torchTexture: Texture;
declare const campfireTexture: Texture;

// #region guide:scene-composition
class CampScene extends Scene {
  override init(): void {
    const lighting = new LightmapLighting(this.app, { ambient: new Color(20, 24, 40), scene: this });
    this.systems.add(lighting);

    // Built imperatively because the code below keeps driving it.
    const campfire = new Sprite(campfireTexture);
    campfire.anchor.set(0.5, 1);

    const camp = (
      <Container name="camp" x={this.app.width / 2} y={this.app.height * 0.7}>
        <Graphics
          ref={ground => {
            ground.fillColor = new Color(40, 52, 36);
            ground.drawRectangle(-240, 0, 480, 40);
          }}
        />
        {campfire}
        <PointLight radius={260} color={new Color(255, 170, 80)} y={-24} ref={light => lighting.add(light)} />
        {[-140, 140].map(x => (
          <Container name="torch" x={x}>
            <Sprite texture={torchTexture} anchor={{ x: 0.5, y: 1 }} />
            <PointLight radius={140} color={new Color(255, 200, 120)} y={-48} ref={light => lighting.add(light)} />
          </Container>
        ))}
        <Text text="Camp" fontSize={18} y={24} anchor={{ x: 0.5, y: 0 }} />
      </Container>
    );

    this.root.addChild(camp);
    this.tweens.create(campfire.scale).to({ y: 1.08 }, 0.4).start();
  }
}
// #endregion guide:scene-composition

export { CampScene };
