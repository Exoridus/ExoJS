import type { LoadStateValue } from '#core/LoadState';

export const inspectState = (input: {
  stored: boolean;
  handleState: LoadStateValue | undefined;
  queuedInBackground: boolean;
  inFlight: boolean;
}): 'idle' | 'queued' | 'loading' | 'ready' | 'failed' => {
  const { stored, handleState, queuedInBackground, inFlight } = input;

  if (handleState === 'failed') {
    return 'failed';
  }

  if (stored) {
    return 'ready';
  }

  if (queuedInBackground) {
    return 'queued';
  }

  if (inFlight || handleState === 'loading') {
    return 'loading';
  }

  return handleState === 'ready' ? 'ready' : 'idle';
};
