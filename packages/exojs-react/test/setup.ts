import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Unmount any React tree rendered with @testing-library/react after each test so
// the jsdom document — and the ExoContext providers / effects mounted into it —
// do not leak between cases. RTL auto-registers this when it can detect a global
// `afterEach`; we wire it explicitly so the suite does not depend on that.
afterEach(() => {
  cleanup();
});
