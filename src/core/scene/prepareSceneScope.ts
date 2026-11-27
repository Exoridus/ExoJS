import type { SceneScope } from './SceneScope';

export const prepareSceneScope = async <Data>(scope: SceneScope<Data>, data: Data): Promise<SceneScope<Data> | null> => {
  try {
    if (await scope.prepare(data)) {
      return scope;
    }
  } catch (error) {
    scope.destroyFailedActivation();

    throw error;
  }

  scope.destroyFailedActivation();

  return null;
};
