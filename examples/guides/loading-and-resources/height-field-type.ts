import type { AssetFactory, AssetSourceCodec } from '@codexo/exojs';
import { AssetType, textSourceCodec } from '@codexo/exojs';

// #region guide:height-field-type
// 1. The resource your factory produces.
export class HeightField {
  public constructor(public readonly rows: readonly number[][]) {}
}

// 2. Register the type with the type system (declaration merging).
declare module '@codexo/exojs' {
  interface AssetDefinitions {
    heightField: { resource: HeightField; config: { source: string }; isValue: true };
  }
}

// 3. Describe the type. `codec` says how the data is read; `createFactory`
//    turns it into the resource, once per application.
export class HeightFieldAssetType extends AssetType<string, HeightField> {
  public readonly id = 'com.example.height-field';
  public override readonly codec: AssetSourceCodec<string> = textSourceCodec;

  public createFactory(): AssetFactory<string, HeightField> {
    return { create: source => Promise.resolve(new HeightField(parseHeightField(source))) };
  }
}

export const heightFieldType = new HeightFieldAssetType();

function parseHeightField(text: string): number[][] {
  return text.split('\n').map(row => row.split(',').map(Number));
}
// #endregion guide:height-field-type
