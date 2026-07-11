import { describe, expect, it } from 'vitest';

import { BoxShape, CircleShape, PhysicsBody, PhysicsWorld } from '../src/index';

/**
 * Continuous collision detection / bullet-mode.
 * A body flagged `isBullet` is swept against static geometry each step so it
 * cannot tunnel through thin walls. +Y down.
 */

const FRAME = 1 / 60;

/** A world with a thin static wall at `x = 200` and a small ball fired at it from the left. */
const fireAtWall = (bullet: boolean): { world: PhysicsWorld; ball: PhysicsBody } => {
  const world = new PhysicsWorld({ gravity: { x: 0, y: 0 } });

  world.add(new PhysicsBody({ type: 'static', position: { x: 200, y: 0 }, colliders: [{ shape: new BoxShape(4, 400) }] }));

  const ball = new PhysicsBody({ type: 'dynamic', position: { x: 0, y: 0 }, colliders: [{ shape: new CircleShape(6) }] });
  ball.isBullet = bullet;
  world.add(ball);
  ball.linearVelocityX = 6000; // ~100 px per fixed step — far more than the 4px wall thickness

  return { world, ball };
};

describe('continuous collision (bullet mode)', () => {
  it('a fast bullet does not tunnel through a thin static wall', () => {
    // Without CCD the body tunnels straight through (the documented limit).
    const plain = fireAtWall(false);
    for (let frame = 0; frame < 30; frame++) {
      plain.world.step(FRAME);
    }
    expect(plain.ball.x).toBeGreaterThan(220); // passed clean through the wall

    // With isBullet the swept test stops it at the wall.
    const ccd = fireAtWall(true);
    for (let frame = 0; frame < 30; frame++) {
      ccd.world.step(FRAME);
    }
    expect(ccd.ball.x).toBeLessThan(200); // never crossed the wall plane at x = 200
    expect(Number.isFinite(ccd.ball.x)).toBe(true);
  });

  it('a bullet that does not cross a wall is not falsely stopped', () => {
    const world = new PhysicsWorld({ gravity: { x: 0, y: 0 } });
    // The wall spans y ∈ [−200, 200]; the bullet flies past well above it.
    world.add(new PhysicsBody({ type: 'static', position: { x: 200, y: 0 }, colliders: [{ shape: new BoxShape(4, 400) }] }));

    const ball = new PhysicsBody({ type: 'dynamic', position: { x: 0, y: 300 }, colliders: [{ shape: new CircleShape(6) }] });
    ball.isBullet = true;
    world.add(ball);
    ball.linearVelocityX = 6000;

    for (let frame = 0; frame < 10; frame++) {
      world.step(FRAME);
    }

    expect(ball.x).toBeGreaterThan(400); // flew freely past the wall's x without being clamped
  });

  it('a fast bullet stays finite and contained in a closed static box', () => {
    const world = new PhysicsWorld({ gravity: { x: 0, y: 0 } });
    const wall = (x: number, y: number, w: number, h: number): void => {
      world.add(new PhysicsBody({ type: 'static', position: { x, y }, colliders: [{ shape: new BoxShape(w, h) }] }));
    };
    wall(0, -110, 240, 20);
    wall(0, 110, 240, 20);
    wall(-110, 0, 20, 240);
    wall(110, 0, 20, 240);

    const ball = new PhysicsBody({ type: 'dynamic', position: { x: 0, y: 0 }, colliders: [{ shape: new CircleShape(6), restitution: 0.5 }] });
    ball.isBullet = true;
    world.add(ball);
    ball.linearVelocityX = 5000;
    ball.linearVelocityY = 3000;

    for (let frame = 0; frame < 120; frame++) {
      world.step(FRAME);
    }

    // CCD keeps it inside the thin-walled box — never escaping, never NaN.
    expect(Number.isFinite(ball.x)).toBe(true);
    expect(Number.isFinite(ball.y)).toBe(true);
    expect(Math.abs(ball.x)).toBeLessThan(105);
    expect(Math.abs(ball.y)).toBeLessThan(105);
  });

  it('a fast bullet does not tunnel through a thin *dynamic* body', () => {
    // A thin dynamic target the bullet's per-step landings straddle without ever
    // landing inside it, so discrete detection misses it — only a swept test catches it.
    const make = (bullet: boolean): { world: PhysicsWorld; ball: PhysicsBody } => {
      const world = new PhysicsWorld({ gravity: { x: 0, y: 0 } });
      // Heavy thin dynamic target at x = 200 (barely shoved within the short run).
      world.add(new PhysicsBody({ type: 'dynamic', position: { x: 200, y: 0 }, colliders: [{ shape: new BoxShape(8, 160), density: 50 }] }));

      const ball = new PhysicsBody({ type: 'dynamic', position: { x: 55, y: 0 }, colliders: [{ shape: new CircleShape(6) }] });
      ball.isBullet = bullet;
      world.add(ball);
      ball.linearVelocityX = 6000; // step landings 55 → 155 → 255 straddle the target without landing in it

      return { world, ball };
    };

    // A non-bullet skips clean through the thin target (discrete detection misses it).
    const plain = make(false);
    for (let frame = 0; frame < 6; frame++) {
      plain.world.step(FRAME);
    }
    expect(plain.ball.x).toBeGreaterThan(210); // tunnelled straight past the dynamic target

    // The bullet is swept against the dynamic target too and stops just short of it.
    const ccd = make(true);
    for (let frame = 0; frame < 6; frame++) {
      ccd.world.step(FRAME);
    }
    expect(ccd.ball.x).toBeLessThan(196); // clamped on the near side of the target's left face
    expect(Number.isFinite(ccd.ball.x)).toBe(true);
  });

  it('a bullet hitting a wall obliquely deflects (keeps its tangential velocity)', () => {
    const world = new PhysicsWorld({ gravity: { x: 0, y: 0 } });
    world.add(new PhysicsBody({ type: 'static', position: { x: 200, y: 0 }, colliders: [{ shape: new BoxShape(4, 800) }] }));

    // Fired right-and-down at a vertical wall: the wall normal is horizontal, so a
    // correct impact resolves the x-component and leaves the y (tangential) intact.
    const ball = new PhysicsBody({ type: 'dynamic', position: { x: 0, y: 0 }, colliders: [{ shape: new CircleShape(6) }] });
    ball.isBullet = true;
    world.add(ball);
    ball.linearVelocityX = 6000;
    ball.linearVelocityY = 2000;

    for (let frame = 0; frame < 5; frame++) {
      world.step(FRAME);
    }

    expect(ball.x).toBeLessThan(200); // stopped at the wall, did not tunnel
    // It slides down the wall — a velocity-kill (stripping the whole travel vector)
    // would have dead-stopped it at vy ≈ 0.
    expect(ball.linearVelocityY).toBeGreaterThan(1000);
  });

  it('a bullet with negligible motion this step is skipped by the sweep (near-zero distance)', () => {
    const world = new PhysicsWorld({ gravity: { x: 0, y: 0 } });
    const ball = new PhysicsBody({ type: 'dynamic', position: { x: 0, y: 0 }, colliders: [{ shape: new CircleShape(6) }] });
    ball.isBullet = true;
    world.add(ball);

    // No velocity, no gravity — the body barely moves (well below the sweep's
    // 1e-6 distance floor), so `_advanceBullets` must bail out via the
    // near-zero-distance guard instead of normalizing a ~zero-length direction.
    expect(() => world.step(FRAME)).not.toThrow();
    expect(ball.x).toBe(0);
    expect(ball.y).toBe(0);
  });

  it('a slow bullet impact below the restitution threshold does not bounce', () => {
    const world = new PhysicsWorld({ gravity: { x: 0, y: 0 } });
    // The ball starts with its surface a hair short of the wall face at x = 198
    // and creeps in at 0.5 px/s — well below `ccdRestitutionThreshold` (1 px/s),
    // so the swept-shape response must be a pure slide (restitution 0), not a
    // bounce, and the discrete solver takes over the resting contact afterwards.
    world.add(new PhysicsBody({ type: 'static', position: { x: 200, y: 0 }, colliders: [{ shape: new BoxShape(4, 400) }] }));
    const ball = new PhysicsBody({ type: 'dynamic', position: { x: 191.99, y: 0 }, colliders: [{ shape: new CircleShape(6) }] });
    ball.isBullet = true;
    world.add(ball);
    ball.linearVelocityX = 0.5;

    for (let frame = 0; frame < 5; frame++) {
      world.step(FRAME);
      // A bounce (restitution > 0) would reverse the velocity to a negative
      // value; a slide (restitution 0) cancels the inward velocity to ~0.
      expect(ball.linearVelocityX).toBeGreaterThan(-0.05);
    }

    expect(ball.x).toBeGreaterThan(191); // still at the wall, not repelled
    expect(ball.x).toBeLessThan(192.2); // never tunnelled past the surface
    expect(Math.abs(ball.linearVelocityX)).toBeLessThan(0.01); // slid to a stop
  });
});

describe('continuous collision (swept shape, not just the centre)', () => {
  /**
   * Finding P3f: the old CCD swept only the body's centre point, so a large
   * fast body whose centre path misses an obstacle but whose extents would hit
   * it tunnelled straight through. These cases all fire a body past a thin
   * obstacle OFF-CENTRE: the centre line clears the obstacle, the shape does not.
   */

  it('a large fast box whose centre path misses a thin wall does not tunnel (extents hit)', () => {
    // Wall x ∈ [198, 202], y ∈ [-50, 50]. The box flies at y = 70 (centre line
    // clears the wall top at y = 50) but spans y ∈ [40, 100] — a 10px face hit.
    const make = (bullet: boolean): { world: PhysicsWorld; box: PhysicsBody } => {
      const world = new PhysicsWorld({ gravity: { x: 0, y: 0 } });
      world.add(new PhysicsBody({ type: 'static', position: { x: 200, y: 0 }, colliders: [{ shape: new BoxShape(4, 100) }] }));

      const box = new PhysicsBody({ type: 'dynamic', position: { x: 55, y: 70 }, colliders: [{ shape: new BoxShape(20, 60) }] });
      box.isBullet = bullet;
      world.add(box);
      box.linearVelocityX = 6000; // step landings 55 → 155 → 255 straddle the wall

      return { world, box };
    };

    // Discrete detection misses it entirely — and with the old centre-point
    // sweep a bullet tunnelled too (the regression this suite pins).
    const plain = make(false);
    for (let frame = 0; frame < 3; frame++) {
      plain.world.step(FRAME);
    }
    expect(plain.box.x).toBeGreaterThan(210); // tunnelled clean through

    const ccd = make(true);
    for (let frame = 0; frame < 10; frame++) {
      ccd.world.step(FRAME);
    }
    // Leading face stops at the wall face x = 198 → centre ≈ 188.
    expect(ccd.box.x).toBeLessThan(190);
    expect(ccd.box.x).toBeGreaterThan(170);
    expect(Number.isFinite(ccd.box.y)).toBe(true);
  });

  it('a large fast circle whose centre path misses a thin wall is stopped at the corner', () => {
    // Same wall; the ball flies at y = 70 with radius 30, so the centre line
    // clears the wall but the ball's lower quadrant strikes the corner (198, 50).
    const make = (bullet: boolean): { world: PhysicsWorld; ball: PhysicsBody } => {
      const world = new PhysicsWorld({ gravity: { x: 0, y: 0 } });
      world.add(new PhysicsBody({ type: 'static', position: { x: 200, y: 0 }, colliders: [{ shape: new BoxShape(4, 100) }] }));

      const ball = new PhysicsBody({ type: 'dynamic', position: { x: 55, y: 70 }, colliders: [{ shape: new CircleShape(30) }] });
      ball.isBullet = bullet;
      world.add(ball);
      ball.linearVelocityX = 6000;

      return { world, ball };
    };

    const plain = make(false);
    for (let frame = 0; frame < 3; frame++) {
      plain.world.step(FRAME);
    }
    expect(plain.ball.x).toBeGreaterThan(210); // tunnelled clean through

    // The impact frame clamps the ball at the corner: |centre − (198, 50)| = 30
    // → centre x ≈ 175.6 (the response then deflects it around the corner, so
    // only the impact frame is asserted).
    const ccd = make(true);
    ccd.world.step(FRAME);
    ccd.world.step(FRAME);
    expect(ccd.ball.x).toBeLessThan(180);
    expect(ccd.ball.x).toBeGreaterThan(160);
    expect(Number.isFinite(ccd.ball.y)).toBe(true);
  });

  it('a fast box bullet is swept against a static circle it would clip off-centre', () => {
    // Static ball radius 30 at (200, 0); the box flies at y = 35 (a centre-point
    // ray would clear the ball) but spans y ∈ [25, 45], clipping its upper region.
    const make = (bullet: boolean): { world: PhysicsWorld; box: PhysicsBody } => {
      const world = new PhysicsWorld({ gravity: { x: 0, y: 0 } });
      world.add(new PhysicsBody({ type: 'static', position: { x: 200, y: 0 }, colliders: [{ shape: new CircleShape(30) }] }));

      const box = new PhysicsBody({ type: 'dynamic', position: { x: 55, y: 35 }, colliders: [{ shape: new BoxShape(20, 20) }] });
      box.isBullet = bullet;
      world.add(box);
      box.linearVelocityX = 6000;

      return { world, box };
    };

    const plain = make(false);
    for (let frame = 0; frame < 3; frame++) {
      plain.world.step(FRAME);
    }
    expect(plain.box.x).toBeGreaterThan(210); // tunnelled clean through

    const ccd = make(true);
    ccd.world.step(FRAME);
    ccd.world.step(FRAME);
    // The box's lower-right corner meets the circle at x ≈ 183.4 → centre ≈ 173.4.
    expect(ccd.box.x).toBeLessThan(178);
    expect(ccd.box.x).toBeGreaterThan(160);
  });

  it('a fast circle bullet is swept against a static circle it would clip off-centre', () => {
    const make = (bullet: boolean): { world: PhysicsWorld; ball: PhysicsBody } => {
      const world = new PhysicsWorld({ gravity: { x: 0, y: 0 } });
      world.add(new PhysicsBody({ type: 'static', position: { x: 200, y: 0 }, colliders: [{ shape: new CircleShape(20) }] }));

      // Radius 20 flying at y = 30: the centre ray misses the target (impact
      // parameter 30 > 20) but the combined radius 40 > 30 means a solid hit.
      const ball = new PhysicsBody({ type: 'dynamic', position: { x: 55, y: 30 }, colliders: [{ shape: new CircleShape(20) }] });
      ball.isBullet = bullet;
      world.add(ball);
      ball.linearVelocityX = 6000;

      return { world, ball };
    };

    const plain = make(false);
    for (let frame = 0; frame < 3; frame++) {
      plain.world.step(FRAME);
    }
    expect(plain.ball.x).toBeGreaterThan(210); // tunnelled clean through

    const ccd = make(true);
    ccd.world.step(FRAME);
    ccd.world.step(FRAME);
    // Centres meet at distance 40: x = 200 − √(40² − 30²) ≈ 173.5.
    expect(ccd.ball.x).toBeLessThan(178);
    expect(ccd.ball.x).toBeGreaterThan(160);
  });

  it('the sweep respects collision filters (a bullet passes through geometry it cannot collide with)', () => {
    const world = new PhysicsWorld({ gravity: { x: 0, y: 0 } });
    // Wall in category 0x2; the bullet's mask only matches 0x1, so the pair
    // never collides — neither discretely nor via the swept test.
    world.add(
      new PhysicsBody({
        type: 'static',
        position: { x: 200, y: 0 },
        colliders: [{ shape: new BoxShape(4, 400), filter: { category: 0x2 } }],
      }),
    );

    const ball = new PhysicsBody({
      type: 'dynamic',
      position: { x: 0, y: 0 },
      colliders: [{ shape: new CircleShape(6), filter: { category: 0x1, mask: 0x1 } }],
    });
    ball.isBullet = true;
    world.add(ball);
    ball.linearVelocityX = 6000;

    for (let frame = 0; frame < 10; frame++) {
      world.step(FRAME);
    }

    expect(ball.x).toBeGreaterThan(400); // flew straight through the filtered wall
  });

  it('a sensor-only bullet is never clamped (sensors have no contact response)', () => {
    const world = new PhysicsWorld({ gravity: { x: 0, y: 0 } });
    world.add(new PhysicsBody({ type: 'static', position: { x: 200, y: 0 }, colliders: [{ shape: new BoxShape(4, 400) }] }));

    const ball = new PhysicsBody({ type: 'dynamic', position: { x: 0, y: 0 }, colliders: [{ shape: new CircleShape(6), isSensor: true }] });
    ball.isBullet = true;
    world.add(ball);
    ball.linearVelocityX = 6000;

    for (let frame = 0; frame < 10; frame++) {
      world.step(FRAME);
    }

    expect(ball.x).toBeGreaterThan(400); // sensors overlap, they never block
  });

  it('a fast-falling bullet lands and hands the resting contact to the discrete solver', () => {
    // The clamp leaves a hair of overlap so the next step's detection forms a
    // real contact — resting, friction and events stay with the solver instead
    // of the bullet hovering on repeated swept-test velocity kills.
    const world = new PhysicsWorld({ gravity: { x: 0, y: 1000 } });
    world.add(new PhysicsBody({ type: 'static', position: { x: 0, y: 100 }, colliders: [{ shape: new BoxShape(400, 20) }] }));

    const box = new PhysicsBody({ type: 'dynamic', position: { x: 0, y: 0 }, colliders: [{ shape: new BoxShape(20, 20) }] });
    box.isBullet = true;
    world.add(box);
    box.linearVelocityY = 1500; // 25px per step ≫ the 20px box — needs the sweep

    let started = 0;
    world.onCollisionStart.add(() => started++);

    for (let frame = 0; frame < 120; frame++) {
      world.step(FRAME);
    }

    expect(started).toBeGreaterThan(0); // a real discrete contact formed
    expect(Math.abs(box.y - 80)).toBeLessThan(1.5); // resting on the floor top at y = 90
    expect(Math.abs(box.linearVelocityY)).toBeLessThan(5); // at rest, not jittering
  });

  it('a slow bullet far from any geometry runs zero narrow-phase sweep tests (cheap path)', () => {
    const world = new PhysicsWorld({ gravity: { x: 0, y: 0 } });
    world.add(new PhysicsBody({ type: 'static', position: { x: 200, y: 0 }, colliders: [{ shape: new BoxShape(4, 400) }] }));

    const ball = new PhysicsBody({ type: 'dynamic', position: { x: 0, y: 0 }, colliders: [{ shape: new CircleShape(6) }] });
    ball.isBullet = true;
    world.add(ball);
    ball.linearVelocityX = 10; // ~0.17px per step — the swept AABB stays far from the wall

    for (let frame = 0; frame < 10; frame++) {
      world.step(FRAME);
    }

    // The swept-AABB prune rejects every pair before any narrow-phase math runs.
    expect(world._ccdSweepTests).toBe(0);

    // Sanity: the same world does run narrow-phase sweeps once the bullet is fast.
    ball.linearVelocityX = 6000;
    for (let frame = 0; frame < 5; frame++) {
      world.step(FRAME);
    }
    expect(world._ccdSweepTests).toBeGreaterThan(0);
  });
});
