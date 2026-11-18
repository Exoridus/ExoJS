import type { Application } from '@codexo/exojs';

interface OldDocument {
  readonly name: string;
}

interface CurrentDocument extends OldDocument {
  readonly density: number;
}

class Atlas {
  public constructor(public readonly document: CurrentDocument) {}
}

const step = {
  from: 1,
  to: 2,
  migrate: (source: OldDocument): CurrentDocument => ({ name: source.name, density: 1 }),
} as const;

const loader = { create: async (document: CurrentDocument) => new Atlas(document) };
declare const parser: { parse(value: unknown): CurrentDocument };
declare const app: Application;

app.assets.define(Atlas, { type: 'atlas', loader, parser });
app.assets.define(Atlas, { type: 'atlas', loader, parser, version: 2, migrations: [step] });
app.assets.define(Atlas, { type: 'atlas', loader, parser, version: 2, minVersion: 2 });
app.assets.define(Atlas, { type: 'atlas', loader, parser, version: 1000, minVersion: 1000 });
app.assets.define(Atlas, {
  type: 'atlas',
  loader,
  parser,
  version: 1001,
  minVersion: 1000,
  migrations: [{ ...step, from: 1000, to: 1001 }],
});
app.assets.define(Atlas, {
  type: 'atlas',
  parser,
  loader: { create: async document => new Atlas(document) },
  version: 2,
  migrations: [step],
});

const incompatibleLoader = {
  create: async (document: { readonly unrelated: string }) => new Atlas({ name: document.unrelated, density: 1 }),
};
// @ts-expect-error - the factory must accept the document returned by the parser.
app.assets.define(Atlas, { type: 'atlas', loader: incompatibleLoader, parser, version: 2, migrations: [step] });

// @ts-expect-error - a version 2 document that still reads version 1 needs a migration.
app.assets.define(Atlas, { type: 'atlas', loader, parser, version: 2 });
// @ts-expect-error - minVersion must be in the document history.
app.assets.define(Atlas, { type: 'atlas', loader, parser, version: 2, minVersion: 3 });
// @ts-expect-error - a migration cannot skip version 2.
app.assets.define(Atlas, { type: 'atlas', loader, parser, version: 3, migrations: [{ ...step, to: 3 }] });
const outdatedStep = { ...step, migrate: (source: OldDocument) => source };
// @ts-expect-error - the last migration must produce the factory's current document.
app.assets.define(Atlas, { type: 'atlas', loader, parser, version: 2, migrations: [outdatedStep] });
const outdatedLargeStep = { ...outdatedStep, from: 1000, to: 1001 } as const;
// @ts-expect-error - large version literals still check the final document type.
app.assets.define(Atlas, { type: 'atlas', loader, parser, version: 1001, minVersion: 1000, migrations: [outdatedLargeStep] });
const oldSerializer = { serialize: (value: Atlas) => ({ name: value.document.name }) };
// @ts-expect-error - a serializer for version 1 cannot write the current document.
app.assets.define(Atlas, { type: 'atlas', loader, parser, serializer: oldSerializer });

const incompatibleStep = {
  from: 2,
  to: 3,
  migrate: (source: { unrelated: string }): CurrentDocument => ({ name: source.unrelated, density: 1 }),
} as const;
// @ts-expect-error - consecutive migrations must agree on the intermediate body type.
app.assets.define(Atlas, { type: 'atlas', loader, parser, version: 3, migrations: [step, incompatibleStep] });
