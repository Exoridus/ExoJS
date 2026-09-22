import type { RenderTarget } from '#rendering/RenderTarget';
import { Shader } from '#rendering/shader/Shader';
import type { SamplerOptions } from '#rendering/texture/TextureOptions';
import { BlendModes } from '#rendering/types';
import type { UniformBlockRecord, UniformFields } from '#rendering/uniforms/uniformDeclarations';

import type { AnyMaterial, MaterialOptions, UniformValue } from './Material';
import { Material } from './Material';
import { derivePipelineKey } from './MaterialKey';

/** Construction options for a {@link MeshMaterial}. */
export interface MeshMaterialOptions<
  F extends UniformFields | undefined = undefined,
  B extends UniformBlockRecord | undefined = undefined,
> extends MaterialOptions<F, B> {
  /**
   * Write the clip-space z of this material's vertex stage into the target's
   * depth attachment. Defaults to `false`.
   *
   * Depth is written, never tested: the comparison is fixed to "always pass", so
   * what is in front of what still follows from draw order and the last draw
   * covering a texel is the one whose depth stays. The result is readable as a
   * texture through {@link RenderTarget.depthTexture}, which is what a fog,
   * depth-of-field or SSAO pass consumes.
   *
   * On a target without a depth attachment the material draws exactly as it
   * would otherwise and writes depth nowhere - the flag is not an error there.
   *
   * The values differ per backend for the same z: WebGL2 maps NDC `[-1, 1]` onto
   * the stored `[0, 1]`, WebGPU's NDC z is already `[0, 1]`. Ordering is the
   * portable part.
   *
   * Cost: a depth-writing draw needs its own pipeline, and on WebGPU its own
   * render pass, so it does not merge with the batches around it.
   */
  readonly writesDepth?: boolean;

  /**
   * Blend mode per colour attachment, in the order the fragment shader's
   * outputs are declared. Defaults to the draw's own blend mode everywhere.
   *
   * What a multi-attachment pass usually wants: the albedo slot composited with
   * alpha, the normal or id slot written straight through, because a blended
   * normal or a blended id is not a value. An entry past the target's
   * attachment count is ignored, and an attachment past the end of the list
   * keeps the blend mode the draw would have used anyway - so `[Normal, Additive]`
   * and a one-attachment target is just a normal draw.
   *
   * Where the list has an entry it wins over a drawable's own `blendMode`
   * override; the attachments it does not cover are where that override still
   * decides, as it does for a material without a list at all.
   *
   * Only the fixed-function modes (`Normal`, `Additive`, `Subtract`, `Multiply`,
   * `Screen`) can differ per attachment; a backdrop-aware mode composites
   * through a pass of its own and blends as `Normal` here, exactly as it does
   * inside a captured backdrop.
   *
   * On WebGL2 entries that differ from each other need the
   * `OES_draw_buffers_indexed` extension, reported as
   * {@link RenderBackend.supportsPerAttachmentBlend}; such a draw throws a
   * {@link RenderError} on a device without it rather than picking one mode for
   * every attachment. WebGPU always supports it.
   */
  readonly blendModes?: readonly BlendModes[];
}

/**
 * Material specialization for {@link Mesh} drawables.
 *
 * Carries the mesh contract conceptually: fixed vertex attribute locations
 * (0 = position, 1 = texcoord, 2 = color), the auto-bound uniforms
 * `u_projection`/`u_translation`/`u_tint`/`u_texture`, and the WGSL
 * group(0)=mesh-uniforms / group(1)=texture / group(2)=user binding scheme.
 * Renderer wiring is added in a later phase.
 * @advanced
 */
export class MeshMaterial<F extends UniformFields | undefined = undefined, B extends UniformBlockRecord | undefined = undefined> extends Material<F, B> {
  public readonly target = 'mesh';

  /** Whether draws with this material write into the target's depth attachment. */
  public readonly writesDepth: boolean;

  /** Blend mode per colour attachment, or `null` when the draw blends as a whole. */
  public readonly blendModes: readonly BlendModes[] | null;

  // The list is fixed for the material's lifetime, so its contribution to the
  // pipeline descriptor is built once rather than on every key read - and
  // `pipelineKey` is read per draw.
  private readonly _blendModesDescriptor: string;

  public constructor(options: MeshMaterialOptions<F, B>) {
    super(options);

    this.writesDepth = options.writesDepth ?? false;
    this.blendModes = options.blendModes ?? null;
    this._blendModesDescriptor = this.blendModes !== null ? this.blendModes.join(',') : '';
  }

  public override get pipelineKey(): number {
    return derivePipelineKey(this.shader.id, this.blendMode, this.writesDepth, this._blendModesDescriptor);
  }

  /**
   * Build a `MeshMaterial` from an existing {@link Shader}.
   * Equivalent to `new MeshMaterial({ shader, ...options })`.
   */
  public static from<F extends UniformFields | undefined, B extends UniformBlockRecord | undefined>(
    source: Shader<F, B>,
    options?: Omit<MeshMaterialOptions<F, B>, 'shader'>,
  ): MeshMaterial<F, B>;
  /**
   * Build a `MeshMaterial` from raw GLSL vertex and fragment source strings.
   * Wraps them in a new {@link Shader}; pass `options.wgsl` to also
   * cover the WebGPU backend.
   */
  public static from(
    glslVertex: string,
    glslFragment: string,
    options?: {
      readonly wgsl?: string;
      readonly uniforms?: Record<string, UniformValue>;
      readonly blendMode?: BlendModes;
      readonly sampler?: SamplerOptions | null;
      readonly writesDepth?: boolean;
      readonly blendModes?: readonly BlendModes[];
    },
  ): MeshMaterial;
  public static from(
    sourceOrGlslVertex: Shader<UniformFields | undefined, UniformBlockRecord | undefined> | string,
    optionsOrGlslFragment?: Omit<MeshMaterialOptions, 'shader'> | string,
    glslOptions?: {
      readonly wgsl?: string;
      readonly uniforms?: Record<string, UniformValue>;
      readonly blendMode?: BlendModes;
      readonly sampler?: SamplerOptions | null;
      readonly writesDepth?: boolean;
      readonly blendModes?: readonly BlendModes[];
    },
  ): MeshMaterial<UniformFields | undefined, UniformBlockRecord | undefined> {
    if (sourceOrGlslVertex instanceof Shader) {
      const opts = optionsOrGlslFragment as Omit<MeshMaterialOptions, 'shader'> | undefined;
      // The overloads above carry the real contract. Here the source's
      // declaration has been erased to "any of them", so the values that come
      // with it no longer describe one instantiation's uniforms.
      const options = { shader: sourceOrGlslVertex, ...(opts !== undefined ? opts : {}) } as unknown as MeshMaterialOptions<
        UniformFields | undefined,
        UniformBlockRecord | undefined
      >;

      return new MeshMaterial(options);
    }

    const shader = new Shader({
      glsl: { vertex: sourceOrGlslVertex, fragment: optionsOrGlslFragment as string },
      ...(glslOptions?.wgsl !== undefined ? { wgsl: glslOptions.wgsl } : {}),
    });

    return new MeshMaterial({
      shader,
      ...(glslOptions?.uniforms !== undefined ? { uniforms: glslOptions.uniforms } : {}),
      ...(glslOptions?.blendMode !== undefined ? { blendMode: glslOptions.blendMode } : {}),
      ...(glslOptions?.sampler !== undefined ? { sampler: glslOptions.sampler } : {}),
      ...(glslOptions?.writesDepth !== undefined ? { writesDepth: glslOptions.writesDepth } : {}),
      ...(glslOptions?.blendModes !== undefined ? { blendModes: glslOptions.blendModes } : {}),
    });
  }
}

/**
 * A mesh material of any uniform schema - what a consumer that only needs to draw
 * with it should accept, since the bare class describes the untyped path.
 */
export type AnyMeshMaterial = MeshMaterial<UniformFields | undefined, UniformBlockRecord | undefined>;

/**
 * Whether drawing with `material` into `target` writes depth: the material has
 * to ask for it and the target has to have somewhere to put it.
 * @internal
 */
export const drawWritesDepth = (material: AnyMaterial | null, target: RenderTarget): boolean =>
  material instanceof MeshMaterial && material.writesDepth && target.depthTexture !== null;

/**
 * The per-attachment blend modes a draw with `material` carries, or `null` when
 * it blends as a whole. Returns the material's own list rather than a resolved
 * one, so a draw that never opted in costs a type check and no allocation.
 * @internal
 */
export const attachmentBlendModes = (material: AnyMaterial | null): readonly BlendModes[] | null =>
  material instanceof MeshMaterial ? material.blendModes : null;

/**
 * The blend mode a draw runs with as a whole: the material owns it, and the
 * drawable's own `blendMode` overrides it once set away from the default.
 *
 * One definition because the refusal in {@link assertPerAttachmentBlendSupported}
 * has to reach the same answer as the renderer it guards - the two decide from
 * different sides of the draw, and a disagreement would refuse a draw the
 * renderer accepts or let one through that it cannot issue.
 * @internal
 */
export const resolveBlendMode = (blendMode: BlendModes, material: AnyMaterial | null): BlendModes =>
  material !== null && blendMode === BlendModes.Normal ? material.blendMode : blendMode;

/**
 * Whether the first `attachments` entries of `modes` do not all resolve to the
 * same blend mode, `fallback` standing in wherever the list has no entry. Only
 * such a draw needs per-attachment blend state from the device.
 * @internal
 */
export const attachmentBlendModesDiffer = (modes: readonly BlendModes[], attachments: number, fallback: BlendModes): boolean => {
  const first = modes[0] ?? fallback;

  for (let index = 1; index < attachments; index++) {
    if ((modes[index] ?? fallback) !== first) {
      return true;
    }
  }

  return false;
};
