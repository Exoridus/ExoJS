import { Color, Container, Graphics, Rectangle } from '@codexo/exojs';

// #region guide:cull-area
// A debris field built from hundreds of small Graphics children - walking
// all of them for getBounds() every frame is wasted work once we already
// know the field never exceeds a 200x200 footprint at its spawn position.
const debris = new Container();

for (let i = 0; i < 300; i++) {
  const shard = new Graphics();
  shard.fillColor = new Color(0x708090);
  shard.drawCircle(0, 0, 2);
  shard.x = Math.random() * 200;
  shard.y = Math.random() * 200;
  debris.addChild(shard);
}

debris.x = 400;
debris.y = 300;

// cullArea is compared directly against the view's bounds, in the same
// world-space coordinates getBounds() would otherwise produce - it is not
// re-transformed by the node's own position/scale/rotation. Since `debris`
// is positioned once and never moves, a static rectangle here stays correct.
debris.cullArea = new Rectangle(debris.x, debris.y, 200, 200);
// #endregion guide:cull-area
