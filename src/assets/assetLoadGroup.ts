/** A path-backed asset handle or a catalog leaf with a loader-owned readiness promise. */
export interface AssetLoadHandle {
  readonly loaded: PromiseLike<unknown>;
}

/** A single asset or a group whose array or object shape is preserved. */
export type AssetLoadGroup = AssetLoadHandle | readonly AssetLoadHandle[] | Readonly<Record<string, AssetLoadHandle>>;

/** Replaces each handle with the value produced by loading it. */
export type LoadedAssetGroup<Input extends AssetLoadGroup> = Input extends AssetLoadHandle
  ? Awaited<Input['loaded']>
  : { [Key in keyof Input]: Input[Key] extends AssetLoadHandle ? Awaited<Input[Key]['loaded']> : never };
