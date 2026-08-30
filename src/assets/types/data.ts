import { type AssetConstructor } from '#assets/AssetConstructor';
import { type AssetFactory } from '#assets/AssetFactory';
import { type AssetSourceCodec, binarySourceCodec, jsonSourceCodec, textSourceCodec } from '#assets/AssetSourceCodec';
import { type AssetRequest, AssetType } from '#assets/AssetType';
import { type CsvAssetOptions, parseCsv } from '#assets/factories/parseCsv';
import { parseSubtitles, subtitleFormatOf, type SubtitleSource } from '#assets/factories/parseSubtitles';
import { parseXmlDocument } from '#assets/factories/parseXml';
import { BinaryAsset, CsvAsset, Json, SubtitleAsset, TextAsset, WasmAsset, XmlAsset } from '#assets/tokens';

/** JSON documents, parsed on read and stored as the text that arrived. */
export class JsonAssetType extends AssetType<unknown, unknown, undefined, string> {
  public readonly id = 'json';
  public override readonly extensions = ['json'];
  public override readonly _token: AssetConstructor = Json;
  public override readonly codec: AssetSourceCodec<unknown, string> = jsonSourceCodec;

  public createFactory(): AssetFactory<unknown, unknown> {
    return { create: source => Promise.resolve(source) };
  }
}

/** UTF-8 text files, handed over as a string. */
export class TextAssetType extends AssetType<string, string> {
  public readonly id = 'text';
  public override readonly extensions = ['txt'];
  public override readonly _token: AssetConstructor = TextAsset;
  public override readonly codec: AssetSourceCodec<string> = textSourceCodec;

  public createFactory(): AssetFactory<string, string> {
    return { create: source => Promise.resolve(source) };
  }
}

/** Arbitrary binary files, handed over as the bytes that arrived. */
export class BinaryAssetType extends AssetType<ArrayBuffer, ArrayBuffer> {
  public readonly id = 'binary';
  public override readonly extensions = ['bin'];
  public override readonly _token: AssetConstructor = BinaryAsset;
  public override readonly codec: AssetSourceCodec<ArrayBuffer> = binarySourceCodec;

  public createFactory(): AssetFactory<ArrayBuffer, ArrayBuffer> {
    return { create: source => Promise.resolve(source) };
  }
}

/** CSV and TSV tables, parsed into rows of raw field strings. */
export class CsvAssetType extends AssetType<string, string[][], CsvAssetOptions> {
  public readonly id = 'csv';
  public override readonly extensions = ['csv'];
  public override readonly _token: AssetConstructor = CsvAsset;
  public override readonly codec: AssetSourceCodec<string> = textSourceCodec;

  /** The delimiter decides how the same text parses, so two delimiters are two resources over one download. */
  public override resourceIdentity({ options }: AssetRequest<CsvAssetOptions>): string {
    return options?.delimiter === undefined ? '' : `delimiter=${options.delimiter}`;
  }

  public createFactory(): AssetFactory<string, string[][], CsvAssetOptions> {
    return { create: (source, context) => Promise.resolve(parseCsv(source, context.options?.delimiter)) };
  }
}

/** XML documents, parsed by the browser's own `DOMParser`. */
export class XmlAssetType extends AssetType<string, Document> {
  public readonly id = 'xml';
  public override readonly extensions = ['xml'];
  public override readonly _token: AssetConstructor = XmlAsset;
  public override readonly codec: AssetSourceCodec<string> = textSourceCodec;

  public createFactory(): AssetFactory<string, Document> {
    return { create: source => Promise.resolve(parseXmlDocument(source)) };
  }
}

/**
 * Compiled `WebAssembly.Module`s.
 *
 * The module is compiled, not instantiated: one module can back many instances,
 * each with its own imports.
 */
export class WasmAssetType extends AssetType<ArrayBuffer, WebAssembly.Module> {
  public readonly id = 'wasm';
  public override readonly extensions = ['wasm'];
  public override readonly _token: AssetConstructor = WasmAsset;
  public override readonly codec: AssetSourceCodec<ArrayBuffer> = binarySourceCodec;

  public createFactory(): AssetFactory<ArrayBuffer, WebAssembly.Module> {
    return { create: source => WebAssembly.compile(source) };
  }
}

/** The built-in `json` asset type. */
export const jsonType = new JsonAssetType();
/** The built-in `text` asset type. */
export const textType = new TextAssetType();
/** The built-in `binary` asset type. */
export const binaryType = new BinaryAssetType();
/** The built-in `csv` asset type. */
export const csvType = new CsvAssetType();
/** The built-in `xml` asset type. */
export const xmlType = new XmlAssetType();
/** The built-in `wasm` asset type. */
export const wasmType = new WasmAssetType();

/**
 * WebVTT and SubRip subtitle tracks, parsed into `VTTCue`s.
 *
 * One type reads both: the format is a property of the file, taken from its
 * suffix, and an unrecognised suffix reads as WebVTT.
 */
export class SubtitleAssetType extends AssetType<SubtitleSource, VTTCue[], undefined, string> {
  public readonly id = 'subtitle';
  public override readonly extensions = ['vtt', 'srt'];
  public override readonly _token: AssetConstructor = SubtitleAsset;
  public override readonly codec: AssetSourceCodec<SubtitleSource, string> = {
    fromResponse: response => response.text(),
    fromBytes: bytes => Promise.resolve(new TextDecoder().decode(bytes)),
    decode: (stored, context) => Promise.resolve({ fmt: subtitleFormatOf(context.locator), text: stored }),
  };

  public createFactory(): AssetFactory<SubtitleSource, VTTCue[]> {
    return { create: source => Promise.resolve(parseSubtitles(source)) };
  }
}

/** The built-in `subtitle` asset type, covering both `.vtt` and `.srt`. */
export const subtitleType = new SubtitleAssetType();
