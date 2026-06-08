import type { ParticleSystem } from "../ParticleSystem";

import { UpdateModule } from './UpdateModule';
import type { WgslContribution } from './WgslContribution';

/**
 * Adds a smooth pseudo-random force field that animates over time.
 * Implemented as 2D value noise with cubic Hermite smoothing — sampled
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
 * GPU-eligible. The noise function is identical on CPU and GPU so visual
 * results match across backends (modulo float precision).
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

  public override apply(system: ParticleSystem, dt: number): void {
    this._time += dt * this.timeScale;
    const t = this._time;
    const f = this.frequency;
    const s = this.strength * dt;

    const { posX, posY, velX, velY, liveCount } = system;

    for (let i = 0; i < liveCount; i++) {
      const x = posX[i] * f;
      const y = posY[i] * f;
      const nx = valueNoise2(x + t, y);
      const ny = valueNoise2(x, y + t + 17.31);

      velX[i] += (nx * 2 - 1) * s;
      velY[i] += (ny * 2 - 1) * s;
    }
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
    let n = sin(dot(p, vec2<f32>(127.1, 311.7))) * 43758.5453;
    return fract(n);
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
    // GPU mode: apply() never runs, so advance _time here once per frame.
    // CPU mode: apply() already advances _time before update finishes,
    // and writeUniforms is not called → no double-advance.
    this._time += dt * this.timeScale;

    view.setFloat32(offset + 0, this.strength, true);
    view.setFloat32(offset + 4, this.frequency, true);
    view.setFloat32(offset + 8, this._time, true);
    view.setFloat32(offset + 12, 0, true);
  }
}

function hash21(x: number, y: number): number {
  let n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  n = n - Math.floor(n);
  return n;
}

function valueNoise2(x: number, y: number): number {
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
}
