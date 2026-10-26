import { type RenderingContext, RenderTexture, type SceneTransitionEnvironment, type Sprite, Time } from '@codexo/exojs';

import { GallerySceneTransition } from '../../examples/shared/gallery-transitions';

interface TestEnvironment extends SceneTransitionEnvironment {
  commitRequested: boolean;
  committed: boolean;
  commits: number;
}

const createEnvironment = (): TestEnvironment => {
  const environment: TestEnvironment = {
    context: { operation: 'change', hasOutgoingScene: true, hasIncomingScene: true },
    commitRequested: false,
    committed: false,
    commits: 0,
    commit(): void {
      environment.commitRequested = true;
      environment.commits++;
    },
  };

  return environment;
};

describe('transition gallery sessions', () => {
  test.each(['iris', 'dissolve', 'snapshot'] as const)('%s waits for commit and keeps each replay independent', effect => {
    const transition = new GallerySceneTransition(effect);
    const environment = createEnvironment();
    const session = transition.beginSession(environment);

    session.update(Time.seconds(10));
    expect(session.done).toBe(false);
    expect(environment.commits).toBe(1);

    environment.committed = true;
    session.update(Time.seconds(-1));
    expect(session.done).toBe(false);
    session.update(Time.seconds(1));
    expect(session.done).toBe(true);
    session.destroy();

    const replay = transition.beginSession(createEnvironment());
    expect(replay.done).toBe(false);
    replay.destroy();
  });

  test.each(['iris', 'dissolve', 'snapshot'] as const)('%s releases its nodes and leaves the borrowed snapshot alive', effect => {
    const session = new GallerySceneTransition(effect).beginSession(createEnvironment());
    const snapshot = new RenderTexture(640, 480);
    const nodes: Sprite[] = [];
    const context = {
      screenView: { width: 640, height: 480, getBounds: () => ({ left: 0, top: 0, right: 640, bottom: 480 }) },
      render: (node: Sprite) => nodes.push(node),
    } as unknown as RenderingContext;

    session.render(context, { outgoing: snapshot, current: null, committed: false });
    expect(nodes).toHaveLength(0);
    session.render(context, { outgoing: snapshot, current: null, committed: true });
    expect(nodes).toHaveLength(1);
    expect(nodes[0]!.texture).toBe(snapshot);
    const mask = nodes[0]!.mask;
    const filter = nodes[0]!.filters?.[0];
    const releaseFilter = filter ? vi.spyOn(filter, 'destroy') : null;

    if (effect === 'iris') {
      expect(mask).not.toBeNull();
    }

    if (effect === 'dissolve') {
      expect(filter).toBeDefined();
    }

    session.destroy();
    expect(nodes[0]!.destroyed).toBe(true);
    expect(nodes[0]!.texture).toBeNull();
    expect(snapshot.destroyed).toBe(false);

    if (mask && 'destroyed' in mask) {
      expect(mask.destroyed).toBe(true);
    }

    expect(releaseFilter?.mock.calls.length ?? 1).toBe(1);
    snapshot.destroy();
  });
});
