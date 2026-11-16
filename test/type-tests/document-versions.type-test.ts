// The version register and its migration chain, checked at compile time.
//
// `pnpm typecheck:type-tests` compiles this file under all three lanes, so
// every assertion below must hold identically in all of them.

import type { CurrentVersion, Latest, Migration, MigrationChain } from '../../src/index';

interface DocV1 {
  readonly image: string;
}
interface DocV2 {
  readonly pages: readonly string[];
}
interface DocV3 {
  readonly pages: readonly string[];
  readonly density: number;
}

type Versions = [DocV1, DocV2, DocV3];

class V1ToV2 implements Migration<DocV1, DocV2> {
  public readonly from = 1;
  public readonly to = 2;

  public migrate(document: DocV1): DocV2 {
    return { pages: [document.image] };
  }
}

class V2ToV3 implements Migration<DocV2, DocV3> {
  public readonly from = 2;
  public readonly to = 3;

  public migrate(document: DocV2): DocV3 {
    return { ...document, density: 1 };
  }
}

class V1ToV3 implements Migration<DocV1, DocV3> {
  public readonly from = 1;
  public readonly to = 3;

  public migrate(document: DocV1): DocV3 {
    return { pages: [document.image], density: 1 };
  }
}

// --- The register names its newest version and document type. ---------------

export const currentVersion: CurrentVersion<Versions> = 3;
export const latest: Latest<Versions> = { pages: [], density: 1 };

// @ts-expect-error - the newest version is 3, not 2.
export const wrongVersion: CurrentVersion<Versions> = 2;
// @ts-expect-error - the newest document carries a density.
export const olderDocument: Latest<Versions> = { pages: [] };

// --- A complete chain satisfies the register. -------------------------------

export const complete = [new V1ToV2(), new V2ToV3()] as const satisfies MigrationChain<Versions>;
export const discontinued = [new V2ToV3()] as const satisfies MigrationChain<Versions, 2>;

// @ts-expect-error - a gap: nothing migrates version 2 to 3.
export const gap = [new V1ToV2()] as const satisfies MigrationChain<Versions>;
// @ts-expect-error - wrong order.
export const reordered = [new V2ToV3(), new V1ToV2()] as const satisfies MigrationChain<Versions>;
// @ts-expect-error - a duplicate step.
export const duplicate = [new V1ToV2(), new V1ToV2()] as const satisfies MigrationChain<Versions>;
// @ts-expect-error - a migration advances exactly one version.
export const skipped = [new V1ToV3()] as const satisfies MigrationChain<Versions>;
// @ts-expect-error - version 1 is discontinued, so its step is dead.
export const dead = [new V1ToV2(), new V2ToV3()] as const satisfies MigrationChain<Versions, 2>;

// --- A register must be a gapless tuple. -------------------------------------

// @ts-expect-error - an array has no current version.
export const arrayRegister: CurrentVersion<DocV1[]> = 1;
