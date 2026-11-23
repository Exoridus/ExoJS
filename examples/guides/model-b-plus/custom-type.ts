import { Application, type DocumentParser, Scene } from '@codexo/exojs';

// #region guide:custom-type
interface DialogueDocument {
  readonly lines: readonly string[];
}

class Dialogue {
  public constructor(public readonly lines: readonly string[]) {}
}

const dialogueParser: DocumentParser<DialogueDocument> = {
  parse(input) {
    const lines = (input as { lines?: unknown } | null)?.lines;

    if (!Array.isArray(lines) || !lines.every(line => typeof line === 'string')) {
      throw new TypeError('A dialogue document needs a "lines" array of strings.');
    }

    return { lines };
  },
};

class IntroScene extends Scene {
  override async load(): Promise<void> {
    const intro = await this.assets.load([Dialogue, 'intro.dialogue.json']);

    console.log(intro.lines);
  }
}

const app = new Application({
  scenes: { IntroScene },
  assetTypes: [
    [
      Dialogue,
      { type: 'dialogue', extensions: ['.dialogue.json'], parser: dialogueParser, decode: document => new Dialogue(document.lines) },
    ],
  ],
});

await app.start(IntroScene);
// #endregion guide:custom-type

// #region guide:define-later
export const equip = (target: Application): void => {
  target.assets.define(Dialogue, {
    type: 'dialogue',
    extensions: ['.dialogue.json'],
    parser: dialogueParser,
    decode: document => new Dialogue(document.lines),
  });
};
// #endregion guide:define-later

// #region guide:custom-binary
class HeightField {
  public constructor(
    public readonly width: number,
    public readonly heights: Uint8Array,
  ) {}
}

export const loadTerrain = async (target: Application, scene: Scene): Promise<HeightField> => {
  // The first byte is the row width; the rest are heights. decode gets the raw bytes.
  target.assets.define(HeightField, {
    type: 'heightField',
    extensions: ['hf'],
    decode: bytes => {
      const view = new Uint8Array(bytes);

      return new HeightField(view[0] ?? 0, view.subarray(1));
    },
  });

  return scene.assets.load([HeightField, 'terrain/valley.hf']);
};
// #endregion guide:custom-binary
