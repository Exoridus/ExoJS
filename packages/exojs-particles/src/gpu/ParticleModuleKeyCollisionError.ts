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
 * The WebGPU and WebGL2 paths both build one combined simulation shader, so
 * both reject the duplicate with this error. Only the CPU path is unaffected:
 * it runs each module's `apply()` independently, one module at a time.
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
