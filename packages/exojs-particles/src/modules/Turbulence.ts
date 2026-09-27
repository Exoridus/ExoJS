import type { ParticleBatch } from '#ParticleStorage';

import type { GlslContribution } from './GlslContribution';
import { UpdateModule } from './UpdateModule';
import type { WgslContribution } from './WgslContribution';

/**
 * Adds a smooth pseudo-random force field that animates over time.
 * Implemented as 2D value noise with cubic Hermite smoothing - sampled
 * twice per particle (offset to decorrelate x and y components) and scaled
 * by `strength`. The field evolves at `timeScale` units per second; lower
 * values produce slow-moving currents, higher values produce buzzy chaos.
 *
 * `frequency` controls the spatial granularity: small values (≈ 0.005)
 * yield broad swirls across the playfield, large values (≈ 0.1) produce
 * tight per-particle jitter.
 *
 * Use cases: smoke turbulence, organic swirls, wind eddies, dust haze.
 * Pair with {@link Drag} to keep particle velocities bounded.
 *
 * CPU and GPU use the same integer lattice hash, avoiding backend-specific
 * transcendental approximations. Interpolation still has float rounding error.
 */
export class Turbulence extends UpdateModule {
  public strength: number;
  public frequency: number;
  public timeScale: number;
  private _time = 0;

  public constructor(strength: number, frequency = 0.01, timeScale = 1) {
    super();
    this.strength = strength;
    this.frequency = frequency;
    this.timeScale = timeScale;
  }

  public override apply(particles: ParticleBatch, dt: number): void {
    this._time += dt * this.timeScale;
    const t = Math.fround(this._time);
    const f = Math.fround(this.frequency);
    const s = this.strength * dt;

    const { x: posX, y: posY } = particles.position;
    const { x: velX, y: velY } = particles.velocity;
    const liveCount = particles.count;

    for (let i = 0; i < liveCount; i++) {
      const x = Math.fround((posX[i] ?? 0) * f);
      const y = Math.fround((posY[i] ?? 0) * f);
      const nx = valueNoise2(Math.fround(x + t), y);
      const ny = valueNoise2(x, Math.fround(Math.fround(y + t) + Math.fround(17.31)));

      velX[i] = (velX[i] ?? 0) + (nx * 2 - 1) * s;
      velY[i] = (velY[i] ?? 0) + (ny * 2 - 1) * s;
    }
  }

  public override glsl(): GlslContribution {
    return {
      ...this.wgsl(),
      prelude: `
float exojs_turbulence_hash21(vec2 p) {
    uint n = uint(int(p.x)) * 0x1f123bb5u ^ uint(int(p.y)) * 0x5f356495u;
    n = (n ^ (n >> 16u)) * 0x7feb352du;
    n = (n ^ (n >> 15u)) * 0x846ca68bu;
    n = n ^ (n >> 16u);
    return float(n >> 8u) / 16777216.0;
}
float exojs_turbulence_valueNoise2(float x, float y) {
    float xi = floor(x);
    float yi = floor(y);
    float xf = x - xi;
    float yf = y - yi;
    float u = xf * xf * (3.0 - 2.0 * xf);
    float v = yf * yf * (3.0 - 2.0 * yf);
    float a = exojs_turbulence_hash21(vec2(xi, yi));
    float b = exojs_turbulence_hash21(vec2(xi + 1.0, yi));
    float c = exojs_turbulence_hash21(vec2(xi, yi + 1.0));
    float d = exojs_turbulence_hash21(vec2(xi + 1.0, yi + 1.0));
    float ab = a + (b - a) * u;
    float cd = c + (d - c) * u;
    return ab + (cd - ab) * v;
}`,
      body: `
float turbX = position.x * u_Turbulence.frequency;
float turbY = position.y * u_Turbulence.frequency;
float turbT = u_Turbulence.time;
float turbNx = exojs_turbulence_valueNoise2(turbX + turbT, turbY);
float turbNy = exojs_turbulence_valueNoise2(turbX, turbY + turbT + 17.31);
velocity += vec2(turbNx * 2.0 - 1.0, turbNy * 2.0 - 1.0) * (u_Turbulence.strength * dt);
`,
    };
  }

  public override wgsl(): WgslContribution {
    return {
      key: 'Turbulence',
      uniforms: [
        { name: 'strength', type: 'f32' },
        { name: 'frequency', type: 'f32' },
        { name: 'time', type: 'f32' },
        { name: '_pad0', type: 'f32' },
      ],
      prelude: `
fn exojs_turbulence_hash21(p: vec2<f32>) -> f32 {
    var n = (bitcast<u32>(i32(p.x)) * 0x1f123bb5u) ^ (bitcast<u32>(i32(p.y)) * 0x5f356495u);
    n = (n ^ (n >> 16u)) * 0x7feb352du;
    n = (n ^ (n >> 15u)) * 0x846ca68bu;
    n = n ^ (n >> 16u);
    return f32(n >> 8u) / 16777216.0;
}

fn exojs_turbulence_valueNoise2(x: f32, y: f32) -> f32 {
    let xi = floor(x);
    let yi = floor(y);
    let xf = x - xi;
    let yf = y - yi;
    let u = xf * xf * (3.0 - 2.0 * xf);
    let v = yf * yf * (3.0 - 2.0 * yf);
    let a = exojs_turbulence_hash21(vec2<f32>(xi, yi));
    let b = exojs_turbulence_hash21(vec2<f32>(xi + 1.0, yi));
    let c = exojs_turbulence_hash21(vec2<f32>(xi, yi + 1.0));
    let d = exojs_turbulence_hash21(vec2<f32>(xi + 1.0, yi + 1.0));
    let ab = a + (b - a) * u;
    let cd = c + (d - c) * u;
    return ab + (cd - ab) * v;
}
            `,
      body: `
                let turbF = modules.u_Turbulence.frequency;
                let turbT = modules.u_Turbulence.time;
                let turbS = modules.u_Turbulence.strength * dt;
                let turbX = positions[idx].x * turbF;
                let turbY = positions[idx].y * turbF;
                let turbNx = exojs_turbulence_valueNoise2(turbX + turbT, turbY);
                let turbNy = exojs_turbulence_valueNoise2(turbX, turbY + turbT + 17.31);
                velocities[idx] = velocities[idx] + vec2<f32>(turbNx * 2.0 - 1.0, turbNy * 2.0 - 1.0) * turbS;
            `,
    };
  }

  public override writeUniforms(view: DataView, offset: number, dt: number): void {
    // apply() does not run during GPU simulation, so advance time here instead.
    this._time += dt * this.timeScale;

    view.setFloat32(offset + 0, this.strength, true);
    view.setFloat32(offset + 4, this.frequency, true);
    view.setFloat32(offset + 8, this._time, true);
    view.setFloat32(offset + 12, 0, true);
  }
}

const hash21 = (x: number, y: number): number => {
  let n = Math.imul(x | 0, 0x1f123bb5) ^ Math.imul(y | 0, 0x5f356495);
  n = Math.imul(n ^ (n >>> 16), 0x7feb352d);
  n = Math.imul(n ^ (n >>> 15), 0x846ca68b);
  n ^= n >>> 16;
  return (n >>> 8) / 16777216;
};

const valueNoise2 = (x: number, y: number): number => {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;

  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);

  const a = hash21(xi, yi);
  const b = hash21(xi + 1, yi);
  const c = hash21(xi, yi + 1);
  const d = hash21(xi + 1, yi + 1);

  const ab = a + (b - a) * u;
  const cd = c + (d - c) * u;
  return ab + (cd - ab) * v;
};
