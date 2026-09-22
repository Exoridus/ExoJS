import * as ex from 'excalibur';

import { replaceExcaliburChild } from '../src/rendering/adapters/excalibur';

describe('Excalibur lifecycle churn', () => {
  test('does not kill an actor after removing it from its parent', () => {
    const parent = new ex.Actor();
    const current = new ex.Actor();
    const replacement = { actor: new ex.Actor(), text: null };
    const kill = vi.spyOn(current, 'kill');

    parent.addChild(current);

    expect(replaceExcaliburChild(parent, current, () => replacement)).toBe(replacement);

    expect(parent.hasChild(current)).toBe(false);
    expect(parent.hasChild(replacement.actor)).toBe(true);
    expect(kill).not.toHaveBeenCalled();
  });
});
