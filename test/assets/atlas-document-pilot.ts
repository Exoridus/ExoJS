/**
 * A three-version document format used to exercise the versioned-document
 * path end to end: frozen document interfaces, a version register, migrations,
 * a parser, an asset type with a `DocumentCodec`, and a factory.
 */

import type { AssetFactory } from '#assets/AssetFactory';
import { AssetType } from '#assets/AssetType';
import { DocumentCodec } from '#assets/DocumentCodec';
import { DocumentHistory } from '#core/document/DocumentHistory';
import type { DocumentParser } from '#core/document/DocumentParser';
import type { Latest, MigrationChain } from '#core/document/documentVersions';
import type { Migration } from '#core/document/Migration';

export interface AtlasPageReference {
  readonly $type: string;
  readonly source: string;
}

export interface AtlasDocumentV1 {
  readonly image: string;
  readonly frames: Readonly<Record<string, { readonly x: number; readonly y: number; readonly w: number; readonly h: number }>>;
}

export interface AtlasFrameV2 {
  readonly name: string;
  readonly page: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface AtlasDocumentV2 {
  readonly pages: readonly AtlasPageReference[];
  readonly frames: readonly AtlasFrameV2[];
}

export interface AtlasFrameV3 extends AtlasFrameV2 {
  readonly pivotX: number;
  readonly pivotY: number;
}

export interface AtlasDocumentV3 {
  readonly density: number;
  readonly pages: readonly AtlasPageReference[];
  readonly frames: readonly AtlasFrameV3[];
}

export type AtlasVersions = [AtlasDocumentV1, AtlasDocumentV2, AtlasDocumentV3];
export type AtlasDocument = Latest<AtlasVersions>;

export class AtlasV1ToV2 implements Migration<AtlasDocumentV1, AtlasDocumentV2> {
  public readonly from = 1;
  public readonly to = 2;

  public migrate(document: AtlasDocumentV1): AtlasDocumentV2 {
    return {
      pages: [{ $type: 'texture', source: document.image }],
      frames: Object.entries(document.frames).map(([name, frame]) => ({
        name,
        page: 0,
        x: frame.x,
        y: frame.y,
        width: frame.w,
        height: frame.h,
      })),
    };
  }
}

export class AtlasV2ToV3 implements Migration<AtlasDocumentV2, AtlasDocumentV3> {
  public readonly from = 2;
  public readonly to = 3;

  public migrate(document: AtlasDocumentV2): AtlasDocumentV3 {
    return { density: 1, pages: document.pages, frames: document.frames.map(frame => ({ ...frame, pivotX: 0.5, pivotY: 0.5 })) };
  }
}

export const atlasMigrations = [new AtlasV1ToV2(), new AtlasV2ToV3()] as const satisfies MigrationChain<AtlasVersions>;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

const number = (value: unknown, field: string): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`${field} must be a finite number`);
  }

  return value;
};

const string = (value: unknown, field: string): string => {
  if (typeof value !== 'string') {
    throw new TypeError(`${field} must be a string`);
  }

  return value;
};

export class AtlasParser implements DocumentParser<AtlasDocument> {
  public parse(input: unknown): AtlasDocument {
    if (!isRecord(input) || !Array.isArray(input.pages) || !Array.isArray(input.frames)) {
      throw new TypeError('an atlas needs pages and frames');
    }

    return {
      density: number(input.density, 'density'),
      pages: input.pages.map((page: unknown, index) => {
        if (!isRecord(page) || page.$type !== 'texture') {
          throw new TypeError(`pages[${index}] must be a texture reference`);
        }

        return { $type: 'texture', source: string(page.source, `pages[${index}].source`) };
      }),
      frames: input.frames.map((frame: unknown, index) => {
        if (!isRecord(frame)) {
          throw new TypeError(`frames[${index}] must be an object`);
        }

        return {
          name: string(frame.name, `frames[${index}].name`),
          page: number(frame.page, `frames[${index}].page`),
          x: number(frame.x, `frames[${index}].x`),
          y: number(frame.y, `frames[${index}].y`),
          width: number(frame.width, `frames[${index}].width`),
          height: number(frame.height, `frames[${index}].height`),
          pivotX: number(frame.pivotX, `frames[${index}].pivotX`),
          pivotY: number(frame.pivotY, `frames[${index}].pivotY`),
        };
      }),
    };
  }
}

export class Atlas {
  public constructor(public readonly document: AtlasDocument) {}
}

/** A history that ships `version` as current, keeping only the migrations below it. */
export const atlasHistoryAt = (version: 1 | 2 | 3): DocumentHistory<AtlasDocument> =>
  new DocumentHistory<AtlasDocument>({
    id: 'atlas',
    version,
    migrations: atlasMigrations.slice(0, version - 1),
    parser: version === 3 ? new AtlasParser() : { parse: input => input as AtlasDocument },
  });

export class AtlasAssetType extends AssetType<AtlasDocument, Atlas, undefined, string> {
  public readonly id = 'atlas';
  public override readonly extensions = ['atlas.json'];
  public override readonly codec: DocumentCodec<AtlasDocument>;

  public constructor(history: DocumentHistory<AtlasDocument> = atlasHistoryAt(3)) {
    super();
    this.codec = new DocumentCodec(history);
  }

  public createFactory(): AssetFactory<AtlasDocument, Atlas, undefined> {
    return { create: document => Promise.resolve(new Atlas(document)) };
  }
}
