import { Color, Ease, FadeSceneTransition, type FadeSceneTransitionOptions } from '../../src/index';

const options: FadeSceneTransitionOptions = {
  color: Color.black,
  duration: 250,
  easing: Ease.cubicOut,
  placement: 'screen',
};

new FadeSceneTransition();
new FadeSceneTransition(options);

// @ts-expect-error the positional Color constructor form was removed.
new FadeSceneTransition(Color.black);
// @ts-expect-error there is no retained second positional options argument.
new FadeSceneTransition({}, {});
