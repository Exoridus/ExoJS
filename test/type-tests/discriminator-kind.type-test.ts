// Clean-break guard for the config discriminator rename `type` -> `kind`
// (asset-system v2 delta §2). Compiled by `tsconfig.type-tests.json` via
// `pnpm typecheck:type-tests`. Pre-1.0: there is NO `type` compatibility — an
// explicit config uses `kind`, and the old `{ type, source }` shape is a type
// error, not a silently-accepted alias.

import { Assets } from '@codexo/exojs';

// The `kind` discriminator is the only accepted explicit-config form.
const ok = Assets.from({ config: { kind: 'json', source: 'c.json' } });
void ok.config;

// @ts-expect-error — the legacy `type` discriminator is removed (clean break).
Assets.from({ bad: { type: 'json', source: 'c.json' } });
