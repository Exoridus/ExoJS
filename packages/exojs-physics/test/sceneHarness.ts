// Shared test helpers (not a *.test.ts file, so it is not collected as a suite).
import { type Application, Signal } from '@codexo/exojs';
import { vi } from 'vitest';

/**
 * The part of an Application a SceneDirector touches while it switches,
 * retains, restores and ends scenes without rendering. `errors` collects
 * whatever the director reports instead of throwing.
 */
export const createAppStub = (): { app: Application; errors: Error[] } => {
  const errors: Error[] = [];
  const onError = new Signal<[Error]>();

  onError.add(error => errors.push(error));

  const app = {
    loader: { _releaseScope: vi.fn() },
    interaction: { attachRoot: vi.fn(), detachRoot: vi.fn(), attachUIRoot: vi.fn(), detachUIRoot: vi.fn() },
    onError,
  } as unknown as Application;

  return { app, errors };
};
