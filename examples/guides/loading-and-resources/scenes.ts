import { Asset, Assets, type AudioStream, LoadPriority, Scene, type Sound, Sprite, type Texture } from '@codexo/exojs';

import { Level1Assets, Level2Assets, MenuAssets } from './level-catalogs';
import { TitleAssets } from './title-catalog';

const SharedAssets = Assets.from({
  logo: 'image/logo.png',
  click: 'audio/click.wav',
  atlas: 'image/atlas.png',
});

const CommonAssets = Assets.from({ font: 'fonts/ui.png' });
const GameAssets = Assets.from({ tiles: 'image/tiles.png' });
const ChunkAssets = Assets.from({ terrain: 'image/terrain.png' });

class SingleAssetScene extends Scene {
  private hero!: Sprite;

  // #region guide:load-one
  async load() {
    const texture = await this.loader.load('image/hero.png');
    this.hero = new Sprite(texture);
  }
  // #endregion guide:load-one
}

class ParallelScene extends Scene {
  private hero!: Texture;
  private terrain!: Texture;
  private coin!: Texture;

  // #region guide:load-parallel
  async load() {
    [this.hero, this.terrain, this.coin] = await Promise.all([
      this.loader.load('image/hero.png'),
      this.loader.load('image/terrain.png'),
      this.loader.load('image/coin.png'),
    ]);
  }
  // #endregion guide:load-parallel
}

class MixedTypeScene extends Scene {
  private skyTexture!: Texture;
  private sky!: Sprite;
  private ambient!: AudioStream;
  private coin!: Sound;
  private jump!: Sound;
  private levels!: unknown;

  // #region guide:load-mixed
  async load() {
    [this.skyTexture, this.ambient, this.coin, this.jump, this.levels] = await Promise.all([
      this.loader.load('image/sky.png'),
      this.loader.load(Asset.type('music', 'audio/ambient.ogg')),
      this.loader.load('audio/coin.wav'),
      this.loader.load('audio/jump.wav'),
      this.loader.load('data/levels.json'),
    ]);
  }

  init() {
    this.sky = new Sprite(this.skyTexture);
  }
  // #endregion guide:load-mixed
}

class DestructuredCatalogScene extends Scene {
  private logo!: Sprite;
  private click!: Sound;

  // #region guide:catalog-destructured
  async load() {
    const { logo, click, atlas } = await this.loader.load(SharedAssets);

    this.logo = new Sprite(logo);
    this.click = click;
  }
  // #endregion guide:catalog-destructured
}

class HealedHandleScene extends Scene {
  private logo!: Sprite;
  private startLevel!: string;

  // #region guide:catalog-healed
  async load() {
    // Fetches every entry and heals each handle in place
    await this.loader.load(TitleAssets);

    // Same objects as before load() - now populated
    this.logo = new Sprite(TitleAssets.logo);
    this.startLevel = TitleAssets.config.value.startLevel;
  }
  // #endregion guide:catalog-healed
}

class TwoCatalogScene extends Scene {
  // #region guide:two-catalogs
  async load() {
    await Promise.all([this.loader.load(CommonAssets), this.loader.load(TitleAssets)]);
  }
  // #endregion guide:two-catalogs
}

class ProgressScene extends Scene {
  private _titleProgress = 0;
  private _gameProgress = 0;
  private _gameReady: unknown;

  // #region guide:queue-progress
  async load() {
    const titleQueue = this.loader.load(TitleAssets);
    const gameQueue = this.loader.load(GameAssets);

    titleQueue.onProgress.add(p => {
      this._titleProgress = p.loaded / p.total;
    });
    gameQueue.onProgress.add(p => {
      this._gameProgress = p.loaded / p.total;
    });

    // Title assets must be ready before init runs
    await titleQueue;

    // Game assets continue loading - await them later when entering gameplay
    this._gameReady = gameQueue;
  }
  // #endregion guide:queue-progress
}

class SeamlessHandleScene extends Scene {
  // #region guide:seamless-handle
  async load() {
    const tex = this.loader.get('image/hero.png'); // synchronous for a valid, registered suffix

    if (tex.ready) {
      // draw it
    } else if (tex.state === 'failed') {
      // tex still renders a visible "missing" checker texture
    }

    await tex.loaded; // Promise<this> - resolves once ready, rejects on failure
  }
  // #endregion guide:seamless-handle
}

class ValueAssetScene extends Scene {
  // #region guide:value-asset
  async load() {
    const config = this.loader.get(Asset.type<{ startLevel: string }>('json', 'data/config.json'));

    await config.loaded;
    console.log(config.value.startLevel);
  }
  // #endregion guide:value-asset
}

class ScopeOwnershipScene extends Scene {
  // #region guide:scope-ownership
  async load() {
    const level = this.app.loader.createScope({ name: 'level-1' });
    const hud = this.app.loader.createScope({ name: 'ui:hud' });

    const font = level.get('fonts/ui.png');

    hud.get('fonts/ui.png'); // the same instance - one fetch, two independent owners

    level.destroy();
    console.log(font.loadState); // 'ready' - the HUD still owns it

    hud.destroy();
    console.log(font.loadState); // 'loading' - the last owner let go
  }
  // #endregion guide:scope-ownership
}

class NestedScopeScene extends Scene {
  // #region guide:nested-scopes
  async load() {
    const world = this.loader.createScope({ name: 'world' });
    const chunk = world.createScope({ name: 'chunk:12,8' });

    await chunk.load(ChunkAssets);

    chunk.destroy(); // frees only the chunk's claims
    // the scene ending destroys `world` - and any chunk still alive under it
  }
  // #endregion guide:nested-scopes
}

class ReleaseScene extends Scene {
  // #region guide:release
  async load() {
    const title = this.app.loader.createScope({ name: 'title' });
    const logo = title.get('ui/logo.png');

    await title.load(TitleAssets);

    title.release(TitleAssets); // releases every leaf in the catalog
    title.release(logo); // a single handle from get()
    title.destroy(); // or just drop everything this scope still holds
  }
  // #endregion guide:release
}

class MediaScene extends Scene {
  // #region guide:media-load
  async load() {
    const intro = await this.loader.load(Asset.type('video', 'video/intro.mp4'));
    const theme = await this.loader.load(Asset.type('music', 'audio/theme.ogg'));
  }
  // #endregion guide:media-load

  private async precache(): Promise<void> {
    // #region guide:cache-source
    await this.app.loader.cacheSource(Asset.type('video', 'video/intro.mp4'));
    // #endregion guide:cache-source
  }
}

class LevelHandoffScene extends Scene {
  private tiles!: Texture;
  private map!: { spawn: [number, number] };

  // #region guide:level-handoff
  // In the menu scene
  async load() {
    await this.loader.load(MenuAssets);
  }

  // Later, when entering gameplay
  async _enterLevel1() {
    await this.app.loader.load(Level1Assets);
    this.tiles = Level1Assets.tiles;
    this.map = Level1Assets.map.value;
  }
  // #endregion guide:level-handoff

  private prefetch(): void {
    // #region guide:background-priority
    // Kick off the next level while the player is still in this one
    this.app.loader.load(Level2Assets, { priority: LoadPriority.Background });
    // #endregion guide:background-priority
  }
}

export {
  DestructuredCatalogScene,
  HealedHandleScene,
  LevelHandoffScene,
  MediaScene,
  MixedTypeScene,
  NestedScopeScene,
  ParallelScene,
  ProgressScene,
  ReleaseScene,
  ScopeOwnershipScene,
  SeamlessHandleScene,
  SingleAssetScene,
  TwoCatalogScene,
  ValueAssetScene,
};
