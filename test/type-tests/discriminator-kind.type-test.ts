// Clean-break guard for the config discriminator rename `kind` -> `type`
// (asset-system descriptor redesign, Task 1). Compiled by
// `tsconfig.type-tests.json` via `pnpm typecheck:type-tests`. Pre-1.0: there is
// NO `kind` compatibility - an explicit config uses `type`, and the old
// `{ kind, source }` shape is a type error, not a silently-accepted alias.

import { Assets } from '@codexo/exojs';

// The `type` discriminator is the only accepted explicit-config form.
const ok = Assets.from({ config: { type: 'json', source: 'c.json' } });
void ok.config;

// @ts-expect-error - the legacy `kind` discriminator is removed (clean break).
Assets.from({ bad: { kind: 'json', source: 'c.json' } });
