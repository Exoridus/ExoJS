import { Color, Rectangle, Spritesheet, Texture, Time } from '@codexo/exojs';

import { Constant } from '../src/distributions/Constant';
import { Range } from '../src/distributions/Range';
import { VectorRange } from '../src/distributions/VectorRange';
import { ApplyForce } from '../src/modules/ApplyForce';
import { BurstSpawn } from '../src/modules/BurstSpawn';
import { RateSpawn } from '../src/modules/RateSpawn';
import { SpawnOnDeath } from '../src/modules/SpawnOnDeath';
import { ParticleSystem } from '../src/ParticleSystem';

const makeTexture = (width = 16, height = 16): Texture => {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return new Texture(canvas);
};

const tick = (s: number): Time => Time.zero.clone().set(s * 1000);

describe('ParticleSystem construction shapes', () => {
  test('no texture falls back to the default and uses the default capacity', () => {
    const system = new ParticleSystem();

    expect(system.texture.width).toBe(1);
    expect(system.texture.height).toBe(1);
    expect(system.capacity).toBe(4096);
    expect(system.frames.length).toBe(0);
    expect(system.hasAtlas).toBe(false);
  });

  test('texture with no options uses the default capacity', () => {
    const system = new ParticleSystem(makeTexture());

    expect(system.capacity).toBe(4096);
  });

  test('a single declared frame does not count as an atlas', () => {
    const tex = makeTexture();
    const system = new ParticleSystem(tex, [new Rectangle(0, 0, 8, 8)], { capacity: 4 });

    expect(system.frames.length).toBe(1);
    expect(system.hasAtlas).toBe(false);
  });

  test('Spritesheet overload pulls texture and frames from the sheet', () => {
    const tex = makeTexture(32, 32);
    const sheet = new Spritesheet(tex, {
      frames: {
        a: { frame: { x: 0, y: 0, w: 16, h: 16 } },
        b: { frame: { x: 16, y: 0, w: 16, h: 16 } },
      },
    });

    const system = new ParticleSystem(sheet, { capacity: 4 });

    expect(system.texture).toBe(tex);
    expect(system.frames.length).toBe(2);
    expect(system.hasAtlas).toBe(true);
  });
});

describe('ParticleSystem texture / frame accessors', () => {
  test('setTexture to a different texture resets the texture frame to the new full size', () => {
    const texA = makeTexture(16, 16);
    const texB = makeTexture(32, 24);
    const system = new ParticleSystem(texA, { capacity: 4 });

    system.setTexture(texB);

    expect(system.texture).toBe(texB);
    expect(system.textureFrame.width).toBe(32);
    expect(system.textureFrame.height).toBe(24);
  });

  test('setTexture with the same texture instance is a no-op', () => {
    const tex = makeTexture();
    const system = new ParticleSystem(tex, { capacity: 4 });

    system.setTextureFrame(new Rectangle(1, 2, 3, 4));
    system.setTexture(tex);

    // resetTextureFrame would have been re-triggered on a real change;
    // since it's the same texture, the custom frame set above must survive.
    expect(system.textureFrame.width).toBe(3);
    expect(system.textureFrame.height).toBe(4);
  });

  test('texture property setter delegates to setTexture', () => {
    const texA = makeTexture(16, 16);
    const texB = makeTexture(8, 8);
    const system = new ParticleSystem(texA, { capacity: 4 });

    system.texture = texB;

    expect(system.texture).toBe(texB);
    expect(system.textureFrame.width).toBe(8);
  });

  test('textureFrame property setter delegates to setTextureFrame', () => {
    const system = new ParticleSystem(makeTexture(), { capacity: 4 });

    system.textureFrame = new Rectangle(0, 0, 12, 6);

    expect(system.textureFrame.width).toBe(12);
    expect(system.textureFrame.height).toBe(6);
  });

  test('vertices are centered on the texture frame', () => {
    const system = new ParticleSystem(makeTexture(20, 10), { capacity: 4 });
    const [left, top, right, bottom] = system.vertices;

    expect(left).toBeCloseTo(-10);
    expect(top).toBeCloseTo(-5);
    expect(right).toBeCloseTo(10);
    expect(bottom).toBeCloseTo(5);
  });

  test('texCoords ordering flips when the texture has flipY set', () => {
    const normal = makeTexture(10, 10);
    const flipped = makeTexture(10, 10);
    flipped.flipY = true;

    const normalSystem = new ParticleSystem(normal, { capacity: 4 });
    const flippedSystem = new ParticleSystem(flipped, { capacity: 4 });

    expect(normalSystem.texCoords[0]).not.toBe(flippedSystem.texCoords[0]);
    // Un-flipped: top-left packs minY|minX. Flipped: top-left packs maxY|minX.
    expect(normalSystem.texCoords[0] & 0xffff).toBe(flippedSystem.texCoords[0] & 0xffff);
    expect(normalSystem.texCoords[0]).not.toBe(normalSystem.texCoords[2]);
  });

  test('resetTextureFrame restores the full current texture as the frame', () => {
    const system = new ParticleSystem(makeTexture(16, 16), { capacity: 4 });

    system.setTextureFrame(new Rectangle(2, 2, 4, 4));
    system.resetTextureFrame();

    expect(system.textureFrame.x).toBe(0);
    expect(system.textureFrame.y).toBe(0);
    expect(system.textureFrame.width).toBe(16);
    expect(system.textureFrame.height).toBe(16);
  });
});

describe('ParticleSystem module registries', () => {
  test('spawnModules / updateModules / deathModules expose what was registered', () => {
    const system = new ParticleSystem(makeTexture(), { capacity: 8 });
    const spawn = new RateSpawn({ rate: new Constant(1) });
    const update = new ApplyForce(0, 1);

    system.addSpawnModule(spawn);
    system.addUpdateModule(update);

    const parent = new ParticleSystem(makeTexture(), { capacity: 8 });
    const burst = new BurstSpawn({ schedule: [{ time: 0, count: 1 }] });
    const death = new SpawnOnDeath(parent, burst, 1);

    system.addDeathModule(death);

    expect(system.spawnModules).toEqual([spawn]);
    expect(system.updateModules).toEqual([update]);
    expect(system.deathModules).toEqual([death]);
  });

  test('clearSpawnModules empties the registry and calls destroy() on each module', () => {
    const system = new ParticleSystem(makeTexture(), { capacity: 8 });
    const spawn = new RateSpawn({ rate: new Constant(1) });
    const destroySpy = vi.spyOn(spawn, 'destroy');

    system.addSpawnModule(spawn);
    system.clearSpawnModules();

    expect(destroySpy).toHaveBeenCalledTimes(1);
    expect(system.spawnModules.length).toBe(0);
  });

  test('clearUpdateModules empties the registry and calls destroy() on each module', () => {
    const system = new ParticleSystem(makeTexture(), { capacity: 8 });
    const update = new ApplyForce(0, 1);
    const destroySpy = vi.spyOn(update, 'destroy');

    system.addUpdateModule(update);
    system.clearUpdateModules();

    expect(destroySpy).toHaveBeenCalledTimes(1);
    expect(system.updateModules.length).toBe(0);
  });

  test('clearDeathModules empties the registry and calls destroy() on each module', () => {
    const system = new ParticleSystem(makeTexture(), { capacity: 8 });
    const parent = new ParticleSystem(makeTexture(), { capacity: 8 });
    const burst = new BurstSpawn({ schedule: [{ time: 0, count: 1 }] });
    const death = new SpawnOnDeath(parent, burst, 1);
    const destroySpy = vi.spyOn(death, 'destroy');

    system.addDeathModule(death);
    system.clearDeathModules();

    expect(destroySpy).toHaveBeenCalledTimes(1);
    expect(system.deathModules.length).toBe(0);
  });
});

describe('ParticleSystem.clearParticles', () => {
  test('resets liveCount and per-slot alive/lifetime/elapsed state', () => {
    const system = new ParticleSystem(makeTexture(), { capacity: 8 });

    system.addSpawnModule(new RateSpawn({ rate: new Constant(100), lifetime: new Constant(10) }));
    system.update(tick(1));

    expect(system.liveCount).toBeGreaterThan(0);

    system.clearParticles();

    expect(system.liveCount).toBe(0);
    expect(Array.from(system.alive)).toEqual(new Array(8).fill(0));
    expect(Array.from(system.lifetime)).toEqual(new Array(8).fill(0));
    expect(Array.from(system.elapsed)).toEqual(new Array(8).fill(0));
  });
});

describe('ParticleSystem.destroy', () => {
  test('tears down modules, frames, and resets counters', () => {
    const system = new ParticleSystem(makeTexture(), [new Rectangle(0, 0, 4, 4)], { capacity: 4 });

    system.addSpawnModule(new RateSpawn({ rate: new Constant(10), lifetime: new Constant(10) }));
    system.addUpdateModule(new ApplyForce(0, 1));
    system.update(tick(0.1));

    expect(system.liveCount).toBeGreaterThan(0);

    system.destroy();

    expect(system.liveCount).toBe(0);
    expect(system.spawnModules.length).toBe(0);
    expect(system.updateModules.length).toBe(0);
    expect(Array.from(system.alive)).toEqual(new Array(4).fill(0));
  });
});

describe('RateSpawn — capacity exhaustion and full field config', () => {
  test('spawning past capacity stops early and resets the fractional accumulator', () => {
    const system = new ParticleSystem(makeTexture(), { capacity: 3 });

    system.addSpawnModule(new RateSpawn({ rate: new Constant(1000), lifetime: new Constant(10) }));

    system.update(tick(1));
    expect(system.liveCount).toBe(3);

    // A further tick can't spawn more (system stays full) and must not throw
    // despite the accumulator having built up a large fractional backlog.
    system.update(tick(1));
    expect(system.liveCount).toBe(3);
  });

  test('applies rotation, tint, and textureIndex distributions to spawned particles', () => {
    const system = new ParticleSystem(makeTexture(), { capacity: 8 });

    system.addSpawnModule(
      new RateSpawn({
        rate: new Constant(10),
        lifetime: new Constant(5),
        rotation: new Range(90, 90),
        tint: new Constant(new Color(255, 0, 0, 1)),
        textureIndex: new Constant(2),
      }),
    );

    system.update(tick(0.1));
    expect(system.liveCount).toBeGreaterThan(0);

    for (let i = 0; i < system.liveCount; i++) {
      expect(system.rotations[i]).toBeCloseTo(90);
      expect(system.color[i] & 0xff).toBe(255); // red channel of packed RGBA
      expect(system.textureIndex[i]).toBe(2);
    }
  });
});

describe('BurstSpawn — capacity exhaustion and full field config', () => {
  test('a burst that exceeds remaining capacity stops early without throwing', () => {
    const system = new ParticleSystem(makeTexture(), { capacity: 3 });

    system.addSpawnModule(new BurstSpawn({ schedule: [{ time: 0, count: 10 }], lifetime: new Constant(10) }));

    system.update(tick(0.1));

    expect(system.liveCount).toBe(3);
  });

  test('applies position/velocity/scale/rotation/tint/textureIndex distributions', () => {
    const system = new ParticleSystem(makeTexture(), { capacity: 8 });

    system.addSpawnModule(
      new BurstSpawn({
        schedule: [{ time: 0, count: 4 }],
        lifetime: new Constant(5),
        position: new VectorRange(1, 1, 2, 2),
        velocity: new VectorRange(3, 3, 4, 4),
        scale: new VectorRange(5, 5, 6, 6),
        rotation: new Range(45, 45),
        rotationSpeed: new Constant(0),
        tint: new Constant(new Color(0, 255, 0, 1)),
        textureIndex: new Constant(1),
      }),
    );

    system.update(tick(0.1));
    expect(system.liveCount).toBe(4);

    for (let i = 0; i < system.liveCount; i++) {
      // update() integrates position by velocity * dt in the same frame the
      // particles are spawned in, so posX/posY have already advanced by
      // velX/velY * 0.1 from their spawn position.
      expect(system.posX[i]).toBeCloseTo(1 + 3 * 0.1);
      expect(system.posY[i]).toBeCloseTo(2 + 4 * 0.1);
      expect(system.velX[i]).toBeCloseTo(3);
      expect(system.velY[i]).toBeCloseTo(4);
      expect(system.scaleX[i]).toBeCloseTo(5);
      expect(system.scaleY[i]).toBeCloseTo(6);
      expect(system.rotations[i]).toBeCloseTo(45);
      expect((system.color[i] >>> 8) & 0xff).toBe(255); // green channel
      expect(system.textureIndex[i]).toBe(1);
    }
  });
});
