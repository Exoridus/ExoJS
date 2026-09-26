// #region guide:catalog-definition
import { Asset, Assets } from '@codexo/exojs';

interface Settings {
  startLevel: string;
}

export const SharedAssets = Assets.from({
  logo: 'image/logo.png',
  settings: Asset.type<Settings>('json', 'data/settings.json'),
});
// #endregion guide:catalog-definition

// #region guide:catalog-result
import type { LoaderScope } from '@codexo/exojs';

export const readStartLevel = async (scope: LoaderScope): Promise<string> => {
  const loaded = await scope.load(SharedAssets);

  console.log(SharedAssets.settings.value.startLevel);
  return loaded.settings.startLevel;
};
// #endregion guide:catalog-result

// #region guide:catalog-composition
const LevelLocal = Assets.from({ ground: 'image/day.png' });

export const DayAssets = Assets.compose(SharedAssets, LevelLocal);
export const NightAssets = Assets.extend(DayAssets, { ground: 'image/night.png' });
// #endregion guide:catalog-composition
