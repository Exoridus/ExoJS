import { Color, Texture, Time } from '@codexo/exojs';

import { BoxArea } from '../src/distributions/BoxArea';
import { CircleArea } from '../src/distributions/CircleArea';
import { ColorGradient } from '../src/distributions/ColorGradient';
import { ConeDirection } from '../src/distributions/ConeDirection';
import { Constant } from '../src/distributions/Constant';
import { Curve } from '../src/distributions/Curve';
import { LineSegment } from '../src/distributions/LineSegment';
import { Range } from '../src/distributions/Range';
import { VectorRange } from '../src/distributions/VectorRange';
import { AlphaFadeOverLifetime } from '../src/modules/AlphaFadeOverLifetime';
import { ApplyForce } from '../src/modules/ApplyForce';
import { AttractToPoint } from '../src/modules/AttractToPoint';
import { BurstSpawn } from '../src/modules/BurstSpawn';
import { ColorOverLifetime } from '../src/modules/ColorOverLifetime';
import { ColorOverSpeed } from '../src/modules/ColorOverSpeed';
import { Drag } from '../src/modules/Drag';
import { OrbitalForce } from '../src/modules/OrbitalForce';
import { RateSpawn } from '../src/modules/RateSpawn';
import { RepelFromPoint } from '../src/modules/RepelFromPoint';
import { RotateOverLifetime } from '../src/modules/RotateOverLifetime';
import { ScaleOverLifetime } from '../src/modules/ScaleOverLifetime';
import { SpawnOnDeath } from '../src/modules/SpawnOnDeath';
import { Turbulence } from '../src/modules/Turbulence';
import { VelocityOverLifetime } from '../src/modules/VelocityOverLifetime';
import { ParticleSystem } from '../src/ParticleSystem';

const makeTexture = (): Texture => {
  const canvas = document.createElement('canvas');
  canvas.width = 16;
  canvas.height = 16;
  return new Texture(canvas);
};

const tick = (s: number): Time => Time.zero.clone().set(s * 1000);

describe('ParticleSystem SoA storage', () => {
  test('allocates typed arrays sized to capacity', () => {
    const system = new ParticleSystem(makeTexture(), { capacity: 1024 });

    expect(system.capacity).toBe(1024);
    expect(system.posX.length).toBe(1024);
    expect(system.posY.length).toBe(1024);
    expect(system.velX.length).toBe(1024);
    expect(system.color.length).toBe(1024);
    expect(system.lifetime.length).toBe(1024);
    expect(system.liveCount).toBe(0);
  });

  test('rejects non-positive capacity', () => {
    const tex = makeTexture();

    expect(() => new ParticleSystem(tex, { capacity: 0 })).toThrow();
    expect(() => new ParticleSystem(tex, { capacity: -1 })).toThrow();
    expect(() => new ParticleSystem(tex, { capacity: 1.5 })).toThrow();
  });

  test('spawn returns sequential slots up to capacity', () => {
    const system = new ParticleSystem(makeTexture(), { capacity: 3 });

    expect(system.spawn()).toBe(0);
    expect(system.spawn()).toBe(1);
    expect(system.spawn()).toBe(2);
    expect(system.spawn()).toBe(-1);
    expect(system.liveCount).toBe(3);
  });

  test('compaction removes expired particles in update()', () => {
    const system = new ParticleSystem(makeTexture(), { capacity: 8 });

    for (let i = 0; i < 4; i++) {
      const slot = system.spawn();
      system.lifetime[slot] = i % 2 === 0 ? 10 : 0.05; // alternate
      system.posX[slot] = i;
    }

    // After 0.1s, the short-lived particles (lifetime 0.05) expire.
    system.update(tick(0.1));

    expect(system.liveCount).toBe(2);
    // Surviving slots should be the long-lived ones (i=0 and i=2).
    const xs = [system.posX[0], system.posX[1]].sort();
    expect(xs).toEqual([0, 2]);
  });

  test('integration advances position by velocity * dt', () => {
    const system = new ParticleSystem(makeTexture(), { capacity: 4 });
    const slot = system.spawn();

    system.lifetime[slot] = 10;
    system.posX[slot] = 100;
    system.velX[slot] = 50;
    system.posY[slot] = 200;
    system.velY[slot] = -30;

    system.update(tick(0.5));

    expect(system.posX[slot]).toBeCloseTo(125);
    expect(system.posY[slot]).toBeCloseTo(185);
  });
});

describe('Distribution', () => {
  test('Constant returns same value', () => {
    const c = new Constant(42);
    expect(c.sample()).toBe(42);
    expect(c.sample()).toBe(42);
    expect(c.evaluate(0.5)).toBe(42);
  });

  test('Range stays within bounds', () => {
    const r = new Range(10, 20);
    for (let i = 0; i < 50; i++) {
      const v = r.sample();
      expect(v).toBeGreaterThanOrEqual(10);
      expect(v).toBeLessThanOrEqual(20);
    }
  });

  test('VectorRange writes both axes into out', () => {
    const r = new VectorRange(0, 100, -50, 50);
    const v = r.sample();

    expect(v.x).toBeGreaterThanOrEqual(0);
    expect(v.x).toBeLessThanOrEqual(100);
    expect(v.y).toBeGreaterThanOrEqual(-50);
    expect(v.y).toBeLessThanOrEqual(50);
  });

  test('Curve interpolates linearly between keyframes', () => {
    const c = new Curve([
      { t: 0, v: 0 },
      { t: 0.5, v: 10 },
      { t: 1, v: 0 },
    ]);

    expect(c.evaluate(0)).toBeCloseTo(0);
    expect(c.evaluate(0.25)).toBeCloseTo(5);
    expect(c.evaluate(0.5)).toBeCloseTo(10);
    expect(c.evaluate(0.75)).toBeCloseTo(5);
    expect(c.evaluate(1)).toBeCloseTo(0);
  });

  test('Curve clamps outside [0, 1]', () => {
    const c = new Curve([
      { t: 0, v: 100 },
      { t: 1, v: 200 },
    ]);

    expect(c.evaluate(-1)).toBe(100);
    expect(c.evaluate(2)).toBe(200);
  });

  test('ColorGradient interpolates and packs RGBA', () => {
    const g = new ColorGradient([
      { t: 0, color: new Color(0, 0, 0, 0) },
      { t: 1, color: new Color(255, 255, 255, 1) },
    ]);

    const mid = g.evaluate(0.5);
    expect(mid.r).toBeCloseTo(127, 0);
    expect(mid.a).toBeCloseTo(0.5);

    expect(g.evaluateRgba(0)).toBe(0);
  });

  test('BoxArea defaults to volume mode when no mode is given', () => {
    const box = new BoxArea(10, 20, -5, 5);

    expect(box.mode).toBe('volume');

    for (let i = 0; i < 50; i++) {
      const v = box.sample();

      expect(v.x).toBeGreaterThanOrEqual(10);
      expect(v.x).toBeLessThanOrEqual(20);
    }
  });

  test('BoxArea volume mode stays within the box', () => {
    const box = new BoxArea(10, 20, -5, 5, 'volume');

    for (let i = 0; i < 50; i++) {
      const v = box.sample();
      expect(v.x).toBeGreaterThanOrEqual(10);
      expect(v.x).toBeLessThanOrEqual(20);
      expect(v.y).toBeGreaterThanOrEqual(-5);
      expect(v.y).toBeLessThanOrEqual(5);
    }
  });

  test('BoxArea edge mode lands on the perimeter', () => {
    const box = new BoxArea(0, 10, 0, 20, 'edge');

    for (let i = 0; i < 50; i++) {
      const v = box.sample();
      const onVerticalEdge = v.x === 0 || v.x === 10;
      const onHorizontalEdge = v.y === 0 || v.y === 20;

      expect(onVerticalEdge || onHorizontalEdge).toBe(true);
      expect(v.x).toBeGreaterThanOrEqual(0);
      expect(v.x).toBeLessThanOrEqual(10);
      expect(v.y).toBeGreaterThanOrEqual(0);
      expect(v.y).toBeLessThanOrEqual(20);
    }
  });

  test('CircleArea defaults to volume mode when no mode is given', () => {
    const circle = new CircleArea(100, 50, 25);

    expect(circle.mode).toBe('volume');

    for (let i = 0; i < 50; i++) {
      const v = circle.sample();
      const dist = Math.hypot(v.x - 100, v.y - 50);

      expect(dist).toBeLessThanOrEqual(25);
    }
  });

  test('CircleArea volume mode stays within the radius', () => {
    const circle = new CircleArea(100, 50, 25, 'volume');

    for (let i = 0; i < 50; i++) {
      const v = circle.sample();
      const dist = Math.hypot(v.x - 100, v.y - 50);

      expect(dist).toBeLessThanOrEqual(25);
    }
  });

  test('CircleArea edge mode lands exactly on the circumference', () => {
    const circle = new CircleArea(0, 0, 10, 'edge');

    for (let i = 0; i < 50; i++) {
      const v = circle.sample();
      const dist = Math.hypot(v.x, v.y);

      expect(dist).toBeCloseTo(10);
    }
  });

  test('LineSegment stays on the line between the endpoints', () => {
    const line = new LineSegment(0, 0, 10, 10);

    for (let i = 0; i < 50; i++) {
      const v = line.sample();

      expect(v.x).toBeGreaterThanOrEqual(0);
      expect(v.x).toBeLessThanOrEqual(10);
      // Diagonal 45° segment: y must track x exactly.
      expect(v.y).toBeCloseTo(v.x);
    }
  });

  test('ConeDirection stays within the angular spread and speed range', () => {
    const cone = new ConeDirection(0, Math.PI / 6, 50, 100);

    for (let i = 0; i < 50; i++) {
      const v = cone.sample();
      const speed = Math.hypot(v.x, v.y);
      const angle = Math.atan2(v.y, v.x);

      expect(speed).toBeGreaterThanOrEqual(50);
      expect(speed).toBeLessThanOrEqual(100);
      expect(Math.abs(angle)).toBeLessThanOrEqual(Math.PI / 6 + 1e-9);
    }
  });

  test('ConeDirection.omni produces full-circle directions within the speed range', () => {
    const cone = ConeDirection.omni(10, 20);

    for (let i = 0; i < 50; i++) {
      const v = cone.sample();
      const speed = Math.hypot(v.x, v.y);

      expect(speed).toBeGreaterThanOrEqual(10);
      expect(speed).toBeLessThanOrEqual(20);
    }
  });
});

describe('SpawnModule', () => {
  test('RateSpawn skips spawning while the accumulated fraction is below one whole particle', () => {
    const system = new ParticleSystem(makeTexture(), { capacity: 8 });

    system.addSpawnModule(
      new RateSpawn({
        rate: new Constant(1),
        lifetime: new Constant(10),
      }),
    );

    // 1 particle/s * 0.01s = 0.01 accumulated — rounds down to 0, so the
    // module must return early without spawning or throwing.
    system.update(tick(0.01));

    expect(system.liveCount).toBe(0);
  });

  test('RateSpawn defaults spawned particles to a 1-second lifetime when omitted', () => {
    const system = new ParticleSystem(makeTexture(), { capacity: 8 });

    system.addSpawnModule(new RateSpawn({ rate: new Constant(100) }));

    // A short tick — a full 1s tick would make elapsed (integrated in the
    // same frame) equal the default lifetime, expiring particles instantly.
    system.update(tick(0.1));

    expect(system.liveCount).toBeGreaterThan(0);

    for (let i = 0; i < system.liveCount; i++) {
      expect(system.lifetime[i]).toBe(1);
    }
  });

  test('RateSpawn emits at configured rate', () => {
    const system = new ParticleSystem(makeTexture(), { capacity: 1024 });

    system.addSpawnModule(
      new RateSpawn({
        rate: new Constant(60),
        lifetime: new Constant(10),
      }),
    );

    // Tick 1 second worth at 60 particles/s expected.
    system.update(tick(1));

    // Allow ±1 for accumulator boundary (60 expected).
    expect(system.liveCount).toBeGreaterThanOrEqual(59);
    expect(system.liveCount).toBeLessThanOrEqual(60);
  });

  test('RateSpawn applies distributions to spawned particle fields', () => {
    const system = new ParticleSystem(makeTexture(), { capacity: 64 });

    system.addSpawnModule(
      new RateSpawn({
        rate: new Constant(10),
        lifetime: new Constant(5),
        position: new VectorRange(0, 0, 0, 0),
        velocity: new VectorRange(100, 100, -200, -200),
        scale: new VectorRange(2, 2, 2, 2),
        rotationSpeed: new Constant(45),
      }),
    );

    system.update(tick(0.1));

    for (let i = 0; i < system.liveCount; i++) {
      // position integrated by 0.1s of 100x/-200y velocity.
      expect(system.posX[i]).toBeCloseTo(10);
      expect(system.posY[i]).toBeCloseTo(-20);
      expect(system.velX[i]).toBeCloseTo(100);
      expect(system.scaleX[i]).toBeCloseTo(2);
      // rotation = rotationSpeed * dt = 45 * 0.1 = 4.5
      expect(system.rotations[i]).toBeCloseTo(4.5);
    }
  });

  test('BurstSpawn with an empty schedule never fires and never throws', () => {
    const system = new ParticleSystem(makeTexture(), { capacity: 8 });

    system.addSpawnModule(new BurstSpawn({ schedule: [], lifetime: new Constant(10) }));

    system.update(tick(1));

    expect(system.liveCount).toBe(0);
  });

  test('BurstSpawn defaults spawned particles to a 1-second lifetime when omitted', () => {
    const system = new ParticleSystem(makeTexture(), { capacity: 8 });

    system.addSpawnModule(new BurstSpawn({ schedule: [{ time: 0, count: 3 }] }));

    system.update(tick(0.1));

    expect(system.liveCount).toBe(3);

    for (let i = 0; i < system.liveCount; i++) {
      expect(system.lifetime[i]).toBe(1);
    }
  });

  test('BurstSpawn fires at scheduled times', () => {
    const system = new ParticleSystem(makeTexture(), { capacity: 128 });

    system.addSpawnModule(
      new BurstSpawn({
        schedule: [
          { time: 0, count: 10 },
          { time: 0.5, count: 5 },
        ],
        lifetime: new Constant(10),
      }),
    );

    // First tick fires the t=0 burst.
    system.update(tick(0.1));
    expect(system.liveCount).toBe(10);

    // Tick past t=0.5 fires the second burst.
    system.update(tick(0.5));
    expect(system.liveCount).toBe(15);
  });

  test('BurstSpawn loop repeats the schedule once exhausted', () => {
    const system = new ParticleSystem(makeTexture(), { capacity: 128 });

    system.addSpawnModule(
      new BurstSpawn({
        schedule: [{ time: 0, count: 5 }],
        lifetime: new Constant(10),
        loop: true,
      }),
    );

    // First tick fires the t=0 burst, then wraps back to t=0 since the
    // 1-entry schedule is immediately exhausted.
    system.update(tick(0.1));
    expect(system.liveCount).toBe(5);

    // Wrapped schedule fires again on the next tick.
    system.update(tick(0.1));
    expect(system.liveCount).toBe(10);
  });

  test('BurstSpawn.reset() restarts the schedule from t=0', () => {
    const system = new ParticleSystem(makeTexture(), { capacity: 128 });

    const burst = new BurstSpawn({
      schedule: [{ time: 0, count: 5 }],
      lifetime: new Constant(10),
    });

    system.addSpawnModule(burst);

    // Fires once; without looping, the schedule stays exhausted afterwards.
    system.update(tick(0.1));
    expect(system.liveCount).toBe(5);

    system.update(tick(1));
    expect(system.liveCount).toBe(5);

    // Explicit reset rewinds the schedule so the t=0 burst can fire again.
    burst.reset();
    system.update(tick(0.1));
    expect(system.liveCount).toBe(10);
  });
});

describe('UpdateModule', () => {
  test('ApplyForce accumulates velocity', () => {
    const system = new ParticleSystem(makeTexture(), { capacity: 4 });
    const slot = system.spawn();

    system.lifetime[slot] = 10;
    system.velX[slot] = 0;
    system.velY[slot] = 0;
    system.addUpdateModule(new ApplyForce(0, 100));

    system.update(tick(0.5));

    expect(system.velY[slot]).toBeCloseTo(50);
  });

  test('Drag damps velocity', () => {
    const system = new ParticleSystem(makeTexture(), { capacity: 4 });
    const slot = system.spawn();

    system.lifetime[slot] = 10;
    system.velX[slot] = 100;
    system.addUpdateModule(new Drag(0.5));

    system.update(tick(1));

    // (1 - 0.5*1) = 0.5 → velX 100 * 0.5 = 50
    expect(system.velX[slot]).toBeCloseTo(50);
  });

  test('ColorOverLifetime samples gradient', () => {
    const system = new ParticleSystem(makeTexture(), { capacity: 4 });
    const slot = system.spawn();

    system.lifetime[slot] = 1;
    system.addUpdateModule(
      new ColorOverLifetime(
        new ColorGradient([
          { t: 0, color: new Color(0, 0, 0, 1) },
          { t: 1, color: new Color(255, 255, 255, 1) },
        ]),
      ),
    );

    system.update(tick(0.5));

    // After 0.5s of 1s lifetime, t≈0.5, so color near grey.
    // RGBA u32 layout is 0xAABBGGRR — extract low byte for red.
    const rgba = system.color[slot];
    const r = rgba & 0xff;

    expect(r).toBeGreaterThan(100);
    expect(r).toBeLessThan(160);
  });

  test('ScaleOverLifetime applies curve to both axes', () => {
    const system = new ParticleSystem(makeTexture(), { capacity: 4 });
    const slot = system.spawn();

    system.lifetime[slot] = 1;
    system.addUpdateModule(
      new ScaleOverLifetime(
        new Curve([
          { t: 0, v: 1 },
          { t: 1, v: 0 },
        ]),
      ),
    );

    system.update(tick(0.25));

    expect(system.scaleX[slot]).toBeCloseTo(0.75, 1);
    expect(system.scaleY[slot]).toBeCloseTo(0.75, 1);
  });

  test('RotateOverLifetime accumulates rotation speed', () => {
    const system = new ParticleSystem(makeTexture(), { capacity: 4 });
    const slot = system.spawn();

    system.lifetime[slot] = 10;
    system.rotationSpeeds[slot] = 0;
    system.addUpdateModule(new RotateOverLifetime(360));

    system.update(tick(1));

    expect(system.rotationSpeeds[slot]).toBeCloseTo(360);
  });

  test('AlphaFadeOverLifetime fades alpha while preserving RGB', () => {
    const system = new ParticleSystem(makeTexture(), { capacity: 4 });
    const slot = system.spawn();

    system.lifetime[slot] = 1;
    // RGBA u32: 0xAABBGGRR — set RGB to mid-grey, alpha to 0xff.
    system.color[slot] = 0xff808080;
    system.addUpdateModule(
      new AlphaFadeOverLifetime(
        new Curve([
          { t: 0, v: 1 },
          { t: 1, v: 0 },
        ]),
      ),
    );

    system.update(tick(0.5));

    const rgba = system.color[slot];
    const r = rgba & 0xff;
    const g = (rgba >>> 8) & 0xff;
    const b = (rgba >>> 16) & 0xff;
    const a = (rgba >>> 24) & 0xff;

    expect(r).toBe(0x80);
    expect(g).toBe(0x80);
    expect(b).toBe(0x80);
    // After 0.5s of 1s lifetime, alpha ≈ 0.5 → ~127.
    expect(a).toBeGreaterThan(100);
    expect(a).toBeLessThan(155);
  });

  test('AlphaFadeOverLifetime defaults to a 1 → 0 linear fade when no curve is given', () => {
    const system = new ParticleSystem(makeTexture(), { capacity: 4 });
    const slot = system.spawn();

    system.lifetime[slot] = 1;
    system.color[slot] = 0xff808080;
    system.addUpdateModule(new AlphaFadeOverLifetime());

    system.update(tick(0.5));

    const rgba = system.color[slot];
    const r = rgba & 0xff;
    const g = (rgba >>> 8) & 0xff;
    const b = (rgba >>> 16) & 0xff;
    const a = (rgba >>> 24) & 0xff;

    expect(r).toBe(0x80);
    expect(g).toBe(0x80);
    expect(b).toBe(0x80);
    expect(a).toBeGreaterThan(100);
    expect(a).toBeLessThan(155);
  });

  test('VelocityOverLifetime scales velocity by curve ratio', () => {
    const system = new ParticleSystem(makeTexture(), { capacity: 4 });
    const slot = system.spawn();

    system.lifetime[slot] = 1;
    system.velX[slot] = 100;
    system.velY[slot] = 0;
    system.addUpdateModule(
      new VelocityOverLifetime(
        new Curve([
          { t: 0, v: 1 },
          { t: 1, v: 0 },
        ]),
      ),
    );

    for (let i = 0; i < 5; i++) {
      system.update(tick(0.1));
    }

    expect(Math.abs(system.velX[slot])).toBeLessThan(80);
    expect(Math.abs(system.velX[slot])).toBeGreaterThan(20);
  });

  test('VelocityOverLifetime treats an exact-zero curve sample as a near-zero sentinel', () => {
    const system = new ParticleSystem(makeTexture(), { capacity: 4 });
    const slot = system.spawn();

    system.lifetime[slot] = 1;
    system.velX[slot] = 100;
    system.velY[slot] = 0;
    system.addUpdateModule(
      new VelocityOverLifetime(
        new Curve([
          { t: 0, v: 1 },
          { t: 1, v: 0 },
        ]),
      ),
    );

    // A single 1s tick advances elapsed to exactly lifetime (t=1), where the
    // curve evaluates to exactly 0 — the module must not store a literal 0
    // (which would divide-by-zero on a later frame) but a tiny sentinel.
    system.update(tick(1));

    expect(system.velX[slot]).toBeCloseTo(0);
  });

  test('AttractToPoint pulls particle toward target', () => {
    const system = new ParticleSystem(makeTexture(), { capacity: 4 });
    const slot = system.spawn();

    system.lifetime[slot] = 10;
    system.posX[slot] = 0;
    system.posY[slot] = 0;
    system.velX[slot] = 0;
    system.velY[slot] = 0;
    system.addUpdateModule(new AttractToPoint(100, 0, 50));

    system.update(tick(1));

    expect(system.velX[slot]).toBeGreaterThan(0);
    expect(Math.abs(system.velY[slot])).toBeLessThan(0.001);
  });

  test('AttractToPoint falloff softens the pull inside the falloff radius', () => {
    const strength = 1000;

    // Unsoftened (falloff=0, the default): full strength regardless of distance.
    const unsoftened = new ParticleSystem(makeTexture(), { capacity: 4 });
    const unsoftenedSlot = unsoftened.spawn();

    unsoftened.lifetime[unsoftenedSlot] = 10;
    unsoftened.posX[unsoftenedSlot] = 90;
    unsoftened.posY[unsoftenedSlot] = 0;
    unsoftened.addUpdateModule(new AttractToPoint(100, 0, strength));

    // Softened: particle is at dist=10 from the target, inside falloff=50,
    // so k = min(1, dist / falloff) = 0.2 scales the acceleration down.
    const softened = new ParticleSystem(makeTexture(), { capacity: 4 });
    const softenedSlot = softened.spawn();

    softened.lifetime[softenedSlot] = 10;
    softened.posX[softenedSlot] = 90;
    softened.posY[softenedSlot] = 0;
    softened.addUpdateModule(new AttractToPoint(100, 0, strength, 50));

    unsoftened.update(tick(1));
    softened.update(tick(1));

    expect(unsoftened.velX[unsoftenedSlot]).toBeCloseTo(1000);
    expect(softened.velX[softenedSlot]).toBeCloseTo(200);
    expect(softened.velX[softenedSlot]).toBeLessThan(unsoftened.velX[unsoftenedSlot]);
  });

  test('AttractToPoint ignores a particle sitting exactly on the target (avoids a divide-by-zero)', () => {
    const system = new ParticleSystem(makeTexture(), { capacity: 4 });
    const slot = system.spawn();

    system.lifetime[slot] = 10;
    system.posX[slot] = 100;
    system.posY[slot] = 0;
    // Zero velocity so integration doesn't move the particle off the exact
    // target position before the module runs.
    system.velX[slot] = 0;
    system.velY[slot] = 0;
    system.addUpdateModule(new AttractToPoint(100, 0, 1000));

    system.update(tick(1));

    // dist === 0 < epsilon guard — the module must skip this particle
    // entirely rather than dividing by zero (which would produce NaN/Infinity).
    expect(system.velX[slot]).toBe(0);
    expect(system.velY[slot]).toBe(0);
  });

  test('RepelFromPoint ignores a particle sitting exactly on the source (avoids a divide-by-zero)', () => {
    const system = new ParticleSystem(makeTexture(), { capacity: 4 });
    const slot = system.spawn();

    system.lifetime[slot] = 10;
    system.posX[slot] = 0;
    system.posY[slot] = 0;
    system.velX[slot] = 0;
    system.velY[slot] = 0;
    system.addUpdateModule(new RepelFromPoint(0, 0, 500));

    system.update(tick(1));

    expect(system.velX[slot]).toBe(0);
    expect(system.velY[slot]).toBe(0);
  });

  test('RepelFromPoint softens the push with a linear falloff inside the radius', () => {
    const system = new ParticleSystem(makeTexture(), { capacity: 4 });
    const slot = system.spawn();

    system.lifetime[slot] = 10;
    system.posX[slot] = 10;
    system.posY[slot] = 0;
    system.velX[slot] = 0;
    system.velY[slot] = 0;
    // dist=10, radius=50 (in range) -> falloff = 1 - 10/50 = 0.8
    // a = strength * falloff * dt / dist = 1000 * 0.8 * 1 / 10 = 80
    system.addUpdateModule(new RepelFromPoint(0, 0, 1000, 50));

    system.update(tick(1));

    expect(system.velX[slot]).toBeCloseTo(800);
  });

  test('RepelFromPoint pushes particle away from source', () => {
    const system = new ParticleSystem(makeTexture(), { capacity: 4 });
    const slot = system.spawn();

    system.lifetime[slot] = 10;
    system.posX[slot] = 10;
    system.posY[slot] = 0;
    system.velX[slot] = 0;
    system.velY[slot] = 0;
    system.addUpdateModule(new RepelFromPoint(0, 0, 50));

    system.update(tick(1));

    expect(system.velX[slot]).toBeGreaterThan(0);
  });

  test('RepelFromPoint respects radius cutoff', () => {
    const system = new ParticleSystem(makeTexture(), { capacity: 4 });
    const slot = system.spawn();

    system.lifetime[slot] = 10;
    system.posX[slot] = 1000;
    system.posY[slot] = 0;
    system.velX[slot] = 0;
    system.velY[slot] = 0;
    system.addUpdateModule(new RepelFromPoint(0, 0, 50, 100));

    system.update(tick(1));

    expect(system.velX[slot]).toBe(0);
  });

  test('OrbitalForce produces tangential velocity', () => {
    const system = new ParticleSystem(makeTexture(), { capacity: 4 });
    const slot = system.spawn();

    system.lifetime[slot] = 10;
    system.posX[slot] = 100;
    system.posY[slot] = 0;
    system.velX[slot] = 0;
    system.velY[slot] = 0;
    system.addUpdateModule(new OrbitalForce(0, 0, 1));

    system.update(tick(0.1));

    expect(system.velY[slot]).toBeGreaterThan(0);
    expect(Math.abs(system.velX[slot])).toBeLessThan(0.001);
  });

  test('Turbulence defaults frequency and timeScale when omitted', () => {
    const turbulence = new Turbulence(50);

    expect(turbulence.frequency).toBe(0.01);
    expect(turbulence.timeScale).toBe(1);
  });

  test('Turbulence perturbs particle velocity', () => {
    const system = new ParticleSystem(makeTexture(), { capacity: 4 });
    const slot = system.spawn();

    system.lifetime[slot] = 10;
    system.posX[slot] = 250;
    system.posY[slot] = 130;
    system.velX[slot] = 0;
    system.velY[slot] = 0;
    system.addUpdateModule(new Turbulence(100, 0.05, 1));

    system.update(tick(0.1));

    const speed = Math.hypot(system.velX[slot], system.velY[slot]);
    expect(speed).toBeGreaterThan(0);
  });

  test('ColorOverSpeed samples gradient by velocity magnitude', () => {
    const system = new ParticleSystem(makeTexture(), { capacity: 4 });
    const slot = system.spawn();

    system.lifetime[slot] = 10;
    system.velX[slot] = 50;
    system.velY[slot] = 0;
    system.addUpdateModule(
      new ColorOverSpeed(
        new ColorGradient([
          { t: 0, color: new Color(0, 0, 0, 1) },
          { t: 1, color: new Color(255, 255, 255, 1) },
        ]),
        0,
        100,
      ),
    );

    system.update(tick(0.01));

    const rgba = system.color[slot];
    const r = rgba & 0xff;

    expect(r).toBeGreaterThan(80);
    expect(r).toBeLessThan(180);
  });
});

describe('DeathModule', () => {
  test('SpawnOnDeath defaults count to 1 when omitted', () => {
    const child = new ParticleSystem(makeTexture(), { capacity: 4 });
    const burst = new BurstSpawn({ schedule: [{ time: 0, count: 1 }], lifetime: new Constant(5) });

    const death = new SpawnOnDeath(child, burst);

    expect(death.count).toBe(1);
  });

  test('SpawnOnDeath fires when particle expires and copies position', () => {
    const parent = new ParticleSystem(makeTexture(), { capacity: 4 });
    const child = new ParticleSystem(makeTexture(), { capacity: 16 });

    const parentSlot = parent.spawn();
    parent.lifetime[parentSlot] = 0.05;
    parent.posX[parentSlot] = 250;
    parent.posY[parentSlot] = 100;

    const burst = new BurstSpawn({
      schedule: [{ time: 0, count: 3 }],
      lifetime: new Constant(5),
    });

    parent.addDeathModule(new SpawnOnDeath(child, burst, 1));

    parent.update(tick(0.1));

    expect(parent.liveCount).toBe(0);
    expect(child.liveCount).toBe(3);

    for (let i = 0; i < child.liveCount; i++) {
      expect(child.posX[i]).toBeCloseTo(250);
      expect(child.posY[i]).toBeCloseTo(100);
    }
  });
});
