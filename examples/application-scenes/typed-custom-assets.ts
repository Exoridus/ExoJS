import {
  Application,
  Asset,
  type AssetFactory,
  Color,
  type DocumentParser,
  FixedResolutionCanvasSizing,
  Graphics,
  Scene,
  Text,
} from '@codexo/exojs';
import { startExample } from '@examples/runtime';

interface PaletteDocument {
  readonly name: string;
  readonly colors: readonly string[];
}

// #region guide:custom-palette-type
class Palette {
  public constructor(
    public readonly name: string,
    public readonly colors: readonly Color[],
  ) {}
}

// The parser validates untrusted data; a cast would not.
const paletteParser: DocumentParser<PaletteDocument> = {
  parse(input) {
    const { name, colors } = (input ?? {}) as { name?: unknown; colors?: unknown };

    if (typeof name !== 'string' || !Array.isArray(colors) || !colors.every(color => typeof color === 'string')) {
      throw new TypeError('A palette needs a name and a list of color strings.');
    }

    return { name, colors };
  },
};

const paletteFactory: AssetFactory<PaletteDocument, Palette> = {
  create: document =>
    Promise.resolve(
      new Palette(
        document.name,
        document.colors.map(color => Color.fromCss(color)),
      ),
    ),
};

// Declaring the type here makes Asset.type('palette', ...) return a typed Palette asset.
declare module '@codexo/exojs' {
  interface AssetDefinitions {
    palette: { resource: Palette; config: { source: string } };
  }
}
// #endregion guide:custom-palette-type

const dataUrl = (document: object): string =>
  `data:application/json,${encodeURIComponent(JSON.stringify({ $type: 'palette', $version: 1, ...document }))}`;

const sunset = dataUrl({ name: 'Sunset', colors: ['#ff595e', '#ffca3a', '#8ac926', '#1982c4', '#6a4c93'] });
const broken = dataUrl({ name: 'Broken', colors: [1, 2, 3] });

// The loader wraps the parser error; the root cause is the readable part.
const rootCause = (error: unknown): string => {
  let current = error;

  while (current instanceof Error && current.cause !== undefined) {
    current = current.cause;
  }

  return current instanceof Error ? current.message : String(current);
};

class PaletteScene extends Scene {
  private readonly swatches = this.track(new Graphics());
  private readonly status = this.track(new Text('', { fillColor: Color.white, fontSize: 24 }));
  private palette!: Palette;
  private rejection = '';

  override async load(): Promise<void> {
    // #region guide:custom-palette-load
    this.palette = await this.loader.load(Asset.type('palette', sunset));
    // #endregion guide:custom-palette-load

    try {
      await this.loader.load(Asset.type('palette', broken));
    } catch (error) {
      this.rejection = rootCause(error);
    }
  }

  override init(): void {
    this.palette.colors.forEach((color, index) => {
      this.swatches.fillColor = color;
      this.swatches.drawRectangle(120 + index * 220, 260, 200, 200);
    });
    this.status.setPosition(120, 120);
    this.status.text = `${this.palette.name}: ${this.palette.colors.length} colors from a typed asset
The invalid document was rejected: ${this.rejection}`;
    this.root.addChild(this.swatches, this.status);
  }
}

const app = new Application({
  scenes: { PaletteScene },
  canvas: { width: 1280, height: 720, mount: document.body, sizing: new FixedResolutionCanvasSizing() },
  clearColor: new Color(18, 24, 29),
  assetTypes: [[Palette, { type: 'palette', parser: paletteParser, loader: paletteFactory }]],
});

await startExample(app, () => app.start(PaletteScene));
