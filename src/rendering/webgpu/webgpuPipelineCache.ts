/// <reference types="@webgpu/types" />

/**
 * A render-pipeline cache keyed without building a key.
 *
 * Every WebGPU renderer selects its pipeline from the same three inputs — blend
 * mode, target format, and whether a stencil clip is active — and the obvious
 * encoding is a template literal (`` `${blendMode}:${format}:${stencil}` ``).
 * That string is built on every draw and thrown away on every draw: measured on
 * the WebGPU allocation harness, the sprite renderer's key alone accounted for
 * **98 KB of the 127 KB a 1000-flush frame allocated** (`blend/1000
 * alternating`), because a template literal of three parts costs the result
 * string plus V8's intermediate cons strings.
 *
 * Two levels instead: the format is already an interned string constant, so it
 * can be a `Map` key as-is, and the remaining two inputs pack into one small
 * integer. Two map lookups, no allocation, same eviction story as before
 * (`clear()` on disconnect / device loss).
 *
 * @internal
 */
export class WebGpuPipelineVariantCache<T> {
  private readonly _byFormat = new Map<GPUTextureFormat, Map<number, T>>();

  public get(format: GPUTextureFormat, variant: number): T | undefined {
    return this._byFormat.get(format)?.get(variant);
  }

  public has(format: GPUTextureFormat, variant: number): boolean {
    return this._byFormat.get(format)?.has(variant) ?? false;
  }

  public set(format: GPUTextureFormat, variant: number, value: T): void {
    let variants = this._byFormat.get(format);

    if (variants === undefined) {
      variants = new Map<number, T>();
      this._byFormat.set(format, variants);
    }

    variants.set(variant, value);
  }

  public clear(): void {
    this._byFormat.clear();
  }
}

/**
 * Pack a blend mode and the stencil flag into one variant key. Blend modes are
 * a small dense enum, so a shift keeps the key a Smi for any conceivable
 * number of them.
 * @internal
 */
export const pipelineVariantKey = (blendMode: number, stencil: boolean): number => (blendMode << 1) | (stencil ? 1 : 0);
