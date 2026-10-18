import type { SceneNode } from '@codexo/exojs';
import type { PhysicsBody } from '@codexo/exojs-physics';
import type { TileProjection } from '@codexo/exojs-tilemap';

/**
 * Explicit presentation of a logical physics body through a tile projection.
 * Call after stepping the world, or use syncInterpolated with the fixed-step
 * interpolation fraction. The node's parent must use map display coordinates.
 * Owns neither body nor node; does not register with the world. Sprite rotation
 * and scale remain application-owned because projection is not a rigid rotation.
 */
export class TilePhysicsBinding {
  public constructor(
    public readonly body: PhysicsBody,
    public readonly node: SceneNode,
    public readonly projection: TileProjection,
  ) {}

  public sync(): void {
    this._sync(this.body.x, this.body.y);
  }

  /** Interpolates logical positions before projection; teleport semantics follow PhysicsBody. */
  public syncInterpolated(alpha: number): void {
    const body = this.body;
    this._sync(body.previousX + (body.x - body.previousX) * alpha, body.previousY + (body.y - body.previousY) * alpha);
  }

  private _sync(x: number, y: number): void {
    const p = this.projection;

    if (p.orientation === 'isometric') {
      this.node.setPosition(p.originX + ((x - y) * p.tileWidth) / (2 * p.tileHeight), p.originY + (x + y) / 2);
    } else {
      this.node.setPosition(p.originX + x, p.originY + y);
    }
  }
}
