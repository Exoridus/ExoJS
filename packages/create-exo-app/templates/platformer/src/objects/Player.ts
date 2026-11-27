import type { Seconds, Spritesheet } from '@codexo/exojs';
import { type Sprite } from '@codexo/exojs';
import type { PhysicsBody, PhysicsWorld } from '@codexo/exojs/physics';
import { BoxShape } from '@codexo/exojs/physics';

const WIDTH = 56;
const HEIGHT = 84;
const RUN_SPEED = 420;
/** Horizontal velocity change per second while a direction is held, and while none is. */
const ACCELERATION = 3600;
const FRICTION = 5200;
const JUMP_SPEED = 780;

/**
 * How long after walking off a ledge a jump still counts. Without it a player
 * who presses jump one frame late gets nothing, and the controls feel broken
 * rather than strict.
 */
const COYOTE_TIME = 0.1 as Seconds;

/**
 * How long before landing a jump press is remembered. The mirror of coyote
 * time: it forgives a press that arrives slightly early instead of dropping it.
 */
const JUMP_BUFFER = 0.12 as Seconds;

/**
 * Share of its upward velocity a rising player keeps per 1/60 s once jump is
 * released, for a variable-height jump. Scaled by the step length, so the arc
 * is the same at any fixed-step rate.
 */
const JUMP_CUT = 0.45;

export interface PlayerInput {
  /** Horizontal direction, -1 (left) to 1 (right); only its sign is used. */
  readonly move: number;
  readonly jumpHeld: boolean;
  /** True only in the fixed step a jump press was delivered to. */
  readonly jumpPressed: boolean;
}

/**
 * The player character: a fixed-rotation dynamic body with a sprite bound to it.
 *
 * Movement is written straight onto the body's velocity rather than applied as
 * a force. A platformer wants exact control over acceleration and top speed,
 * and forces give neither: the same impulse produces a different result
 * depending on what the body is already touching.
 */
export class Player {
  public readonly sprite: Sprite;
  public readonly body: PhysicsBody;

  private readonly _world: PhysicsWorld;
  private readonly _frames: Spritesheet;
  private _coyote = 0 as Seconds;
  private _buffered = 0 as Seconds;
  private _facing: 1 | -1 = 1;

  public constructor(world: PhysicsWorld, frames: Spritesheet, x: number, y: number) {
    this._world = world;
    this._frames = frames;

    this.sprite = frames.getFrameSprite('character_beige_idle').setAnchor(0.5);
    this.sprite.width = WIDTH;
    this.sprite.height = HEIGHT;

    this.body = world.attach(this.sprite, {
      type: 'dynamic',
      position: { x, y },
      shape: new BoxShape(WIDTH * 0.7, HEIGHT),
      // Without this the box tips over the first time it lands on a corner.
      fixedRotation: true,
      friction: 0,
      restitution: 0,
    });
    // A sleeping body ignores velocity written onto it, and a player standing
    // still falls asleep within a second; the next run or jump would do nothing.
    this.body.allowSleep = false;
  }

  public get grounded(): boolean {
    // A ray straight down from just inside the feet. Slightly longer than the
    // gap it is testing for, so a body resting exactly on a surface still
    // registers rather than flickering between grounded and not.
    const origin = { x: this.body.x, y: this.body.y + HEIGHT / 2 - 2 };

    return this._world.rayCast(origin, { x: 0, y: 1 }, undefined, 8) !== null;
  }

  /** Advances the player by one fixed step, before the world integrates it. */
  public fixedUpdate(delta: Seconds, input: PlayerInput): void {
    // Rising is never standing: at a fast fixed step the first step of a jump
    // can still end within the ground ray's reach, and re-arming coyote time
    // there would allow a second jump in mid-air.
    const grounded = this.body.linearVelocityY >= -1 && this.grounded;

    this._coyote = grounded ? COYOTE_TIME : (Math.max(0, this._coyote - delta) as Seconds);
    this._buffered = input.jumpPressed ? JUMP_BUFFER : (Math.max(0, this._buffered - delta) as Seconds);

    this._applyHorizontal(delta, input);

    if (this._buffered > 0 && this._coyote > 0) {
      this.body.linearVelocityY = -JUMP_SPEED;
      // Both timers are spent, or one held jump would fire twice.
      this._buffered = 0 as Seconds;
      this._coyote = 0 as Seconds;
    }

    // Releasing jump while still rising cuts the arc short.
    if (!input.jumpHeld && this.body.linearVelocityY < 0) {
      this.body.linearVelocityY *= JUMP_CUT ** (delta * 60);
    }

    this._updateFrame(grounded);
  }

  public respawn(x: number, y: number): void {
    this.body.setTransform({ x, y }, 0);
    this.body.linearVelocityX = 0;
    this.body.linearVelocityY = 0;
    this._coyote = 0 as Seconds;
    this._buffered = 0 as Seconds;
  }

  private _applyHorizontal(delta: Seconds, input: PlayerInput): void {
    const direction = Math.sign(input.move);
    const velocity = this.body.linearVelocityX;

    if (direction === 0) {
      const decay = FRICTION * delta;

      this.body.linearVelocityX = Math.abs(velocity) <= decay ? 0 : velocity - Math.sign(velocity) * decay;

      return;
    }

    this._facing = direction > 0 ? 1 : -1;
    this.body.linearVelocityX = Math.max(-RUN_SPEED, Math.min(RUN_SPEED, velocity + direction * ACCELERATION * delta));
  }

  private _updateFrame(grounded: boolean): void {
    const moving = Math.abs(this.body.linearVelocityX) > 20;
    const name = !grounded ? 'character_beige_jump' : moving ? 'character_beige_walk_a' : 'character_beige_idle';

    this.sprite.textureFrame = this._frames.getFrame(name);
    // Mirroring by scale keeps the anchor and the body untouched.
    this.sprite.setScale(this._facing * Math.abs(this.sprite.scale.x), this.sprite.scale.y);
  }
}
