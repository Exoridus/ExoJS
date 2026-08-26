import { Assets } from '@codexo/exojs';

const SharedAssets = Assets.from({
  logo: 'image/logo.png',
  click: 'audio/click.wav',
  atlas: 'image/atlas.png',
});

// #region guide:compose-diamond
const Left = Assets.compose(SharedAssets, Assets.from({ tree: 'image/tree.png' }));
const Right = Assets.compose(SharedAssets, Assets.from({ rock: 'image/rock.png' }));

Assets.compose(Left, Right); // { logo, click, atlas, tree, rock } - shared keys counted once
// #endregion guide:compose-diamond
