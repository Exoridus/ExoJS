import { invariant } from '#core/dev';

/**
 * Substitutes `{{NAME}}` placeholders in a shader source loaded from a
 * `.vert`/`.frag`/`.wgsl` file.
 *
 * Shader files are static text, so the few values a shader cannot state for
 * itself - a slot count fixed by device limits, a bit mask shared with the CPU
 * packer - arrive here instead of being interpolated into a template literal.
 *
 * Every placeholder in the source must be supplied and every supplied value
 * must be used: a shader that silently keeps a `{{NAME}}` compiles to nothing
 * useful, and an unused value means the source and its caller have drifted.
 */
export const fillShaderSource = (source: string, values: Readonly<Record<string, string | number>>): string => {
  const used = new Set<string>();
  const filled = source.replaceAll(/\{\{(\w+)\}\}/g, (_match, name: string) => {
    const value = values[name];

    invariant(value !== undefined, `shader: no value for placeholder {{${name}}}`);
    used.add(name);

    return String(value);
  });

  invariant(
    used.size === Object.keys(values).length,
    `shader: unused placeholder values (${Object.keys(values)
      .filter(name => !used.has(name))
      .join(', ')})`,
  );

  return filled;
};
