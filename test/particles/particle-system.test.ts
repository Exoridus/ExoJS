import { ParticleSystem } from '@/particles/ParticleSystem';
import { RateSpawn } from '@/particles/modules/RateSpawn';
import { BurstSpawn } from '@/particles/modules/BurstSpawn';
import { ApplyForce } from '@/particles/modules/ApplyForce';
import { Drag } from '@/particles/modules/Drag';
import { ColorOverLifetime } from '@/particles/modules/ColorOverLifetime';
import { ScaleOverLifetime } from '@/particles/modules/ScaleOverLifetime';
import { RotateOverLifetime } from '@/particles/modules/RotateOverLifetime';
import { SpawnOnDeath } from '@/particles/modules/SpawnOnDeath';
import { Constant } from '@/particles/distributions/Constant';
import { Range } from '@/particles/distributions/Range';
import { VectorRange } from '@/particles/distributions/VectorRange';
import { Curve } from '@/particles/distributions/Curve';
import { Gradient } from '@/particles/distributions/Gradient';
import { Color } from '@/core/Color';
import { Texture } from '@/rendering/texture/Texture';
import { Time } from '@/core/Time';

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
            system.lifetime[slot] = i % 2 === 0 ? 10 : 0.05;  // alternate
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

    test('Gradient interpolates and packs RGBA', () => {
        const g = new Gradient([
            { t: 0, color: new Color(0, 0, 0, 0) },
            { t: 1, color: new Color(255, 255, 255, 1) },
        ]);

        const mid = g.evaluate(0.5);
        expect(mid.r).toBeCloseTo(127, 0);
        expect(mid.a).toBeCloseTo(0.5);

        expect(g.evaluateRgba(0)).toBe(0);
    });
});

describe('SpawnModule', () => {
    test('RateSpawn emits at configured rate', () => {
        const system = new ParticleSystem(makeTexture(), { capacity: 1024 });

        system.addSpawnModule(new RateSpawn({
            rate: new Constant(60),
            lifetime: new Constant(10),
        }));

        // Tick 1 second worth at 60 particles/s expected.
        system.update(tick(1));

        // Allow ±1 for accumulator boundary (60 expected).
        expect(system.liveCount).toBeGreaterThanOrEqual(59);
        expect(system.liveCount).toBeLessThanOrEqual(60);
    });

    test('RateSpawn applies distributions to spawned particle fields', () => {
        const system = new ParticleSystem(makeTexture(), { capacity: 64 });

        system.addSpawnModule(new RateSpawn({
            rate: new Constant(10),
            lifetime: new Constant(5),
            position: new VectorRange(0, 0, 0, 0),
            velocity: new VectorRange(100, 100, -200, -200),
            scale: new VectorRange(2, 2, 2, 2),
            rotationSpeed: new Constant(45),
        }));

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

    test('BurstSpawn fires at scheduled times', () => {
        const system = new ParticleSystem(makeTexture(), { capacity: 128 });

        system.addSpawnModule(new BurstSpawn({
            schedule: [
                { time: 0, count: 10 },
                { time: 0.5, count: 5 },
            ],
            lifetime: new Constant(10),
        }));

        // First tick fires the t=0 burst.
        system.update(tick(0.1));
        expect(system.liveCount).toBe(10);

        // Tick past t=0.5 fires the second burst.
        system.update(tick(0.5));
        expect(system.liveCount).toBe(15);
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
        system.addUpdateModule(new ColorOverLifetime(new Gradient([
            { t: 0, color: new Color(0, 0, 0, 1) },
            { t: 1, color: new Color(255, 255, 255, 1) },
        ])));

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
        system.addUpdateModule(new ScaleOverLifetime(new Curve([
            { t: 0, v: 1 },
            { t: 1, v: 0 },
        ])));

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
});

describe('DeathModule', () => {
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

        // Tick past parent's lifetime; parent expires and triggers child spawn.
        parent.update(tick(0.1));

        expect(parent.liveCount).toBe(0);
        expect(child.liveCount).toBe(3);

        for (let i = 0; i < child.liveCount; i++) {
            expect(child.posX[i]).toBeCloseTo(250);
            expect(child.posY[i]).toBeCloseTo(100);
        }
    });
});
