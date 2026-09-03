/**
 * Thrown when two GPU-eligible update modules on one system contribute the
 * same {@link WgslContribution.key}.
 *
 * A key names exactly one struct and one member of the composite compute
 * shader's uniform block, so two contributions under it cannot be told apart:
 * both bodies would read the same uniforms and only one instance's values
 * would ever reach the device. Give one of them a distinct key, or combine
 * them into a single module.
 *
 * Only the WebGPU path builds that shader - the CPU path runs each module's
 * `apply()` independently and is unaffected - which is why the same scene used
 * to run on WebGL2 and die with a raw WGSL error on WebGPU.
 */
export class ParticleModuleKeyCollisionError extends Error {
  /** The contested {@link WgslContribution.key}. */
  public readonly key: string;

  public constructor(key: string, firstModule: string, secondModule: string) {
    super(
      `ParticleSystem: the update modules ${firstModule} and ${secondModule} both contribute the WGSL key "${key}". ` +
        "A key identifies one uniform struct in the system's compute shader, so two modules cannot share it - " +
        'combine them into a single module, or give one a distinct key.',
    );

    this.name = 'ParticleModuleKeyCollisionError';
    this.key = key;
  }
}
