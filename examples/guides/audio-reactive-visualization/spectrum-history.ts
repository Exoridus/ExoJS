// #region guide:spectrum-history
import { DataTexture, TextureFormat } from '@codexo/exojs';

export class SpectrumHistory {
  readonly texture = new DataTexture({ width: 256, height: 64, format: TextureFormat.R8 });
  private column = 0;

  get nextColumn(): number {
    return this.column;
  }

  write(bands: Uint8Array): void {
    if (bands.length !== 64) {
      throw new Error('SpectrumHistory expects 64 byte-valued bands.');
    }

    for (let row = 0; row < 64; row++) {
      this.texture.buffer[row * 256 + this.column] = bands[row];
    }
    this.texture.commitRect(this.column, 0, 1, 64);
    this.column = (this.column + 1) % 256;
  }

  destroy(): void {
    this.texture.destroy();
  }
}
// #endregion guide:spectrum-history
