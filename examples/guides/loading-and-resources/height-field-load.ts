import { Assets, Scene } from '@codexo/exojs';

import { heightFieldType } from './height-field-type';

class HeightFieldScene extends Scene {
  public override async load(): Promise<void> {
    // #region guide:height-field-load
    // The type itself gives you a fully typed, loadable descriptor
    const field = await this.loader.load(heightFieldType.asset('maps/level-1.hf'));

    // Or grouped in a catalog
    const World = Assets.from({ level1: heightFieldType.asset('maps/level-1.hf') });
    // #endregion guide:height-field-load
  }
}

export { HeightFieldScene };
