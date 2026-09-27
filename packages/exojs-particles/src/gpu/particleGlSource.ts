import type { GlslContribution } from '#modules/GlslContribution';
import type { ParticleUniformPrimitive } from '#modules/ParticleShaderContribution';

import simulationSource from './shaders/particle-simulate.vert';

const glslTypes = new Map<ParticleUniformPrimitive, string>([
  ['f32', 'float'],
  ['i32', 'int'],
  ['u32', 'uint'],
  ['vec2<f32>', 'vec2'],
  ['vec4<f32>', 'vec4'],
]);

export const composeParticleGlSource = (contributions: readonly GlslContribution[], source = simulationSource): string => {
  const declarations = contributions
    .map(item =>
      [
        (item.uniforms?.length ?? 0) > 0
          ? `struct ${item.key}Uniforms { ${item.uniforms!.map(field => `${glslTypes.get(field.type)!} ${field.name};`).join('\n')} }; uniform ${item.key}Uniforms u_${item.key};`
          : '',
        ...(item.textures ?? []).map(binding => `uniform sampler2D u_${item.key}_${binding.name};`),
      ].join('\n'),
    )
    .join('\n');

  return source
    .replace('{{declarations}}', declarations)
    .replace('{{preludes}}', contributions.map(item => item.prelude ?? '').join('\n'))
    .replace('{{bodies}}', contributions.map(item => `{\n${item.body}\n}`).join('\n'));
};
