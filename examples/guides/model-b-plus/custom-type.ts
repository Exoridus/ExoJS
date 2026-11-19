import { Application, type AssetFactory, type DocumentParser, Scene } from '@codexo/exojs';

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

const dialogueFactory: AssetFactory<DialogueDocument, Dialogue> = {
  create: document => Promise.resolve(new Dialogue(document.lines)),
};

class IntroScene extends Scene {
  override async load(): Promise<void> {
    const intro = await this.loader.load('intro.dialogue.json');

    console.log(intro);
  }
}

const app = new Application({
  scenes: { IntroScene },
  assetTypes: [[Dialogue, { type: 'dialogue', extensions: ['.dialogue.json'], parser: dialogueParser, loader: dialogueFactory }]],
});

await app.start(IntroScene);
// #endregion guide:custom-type

// #region guide:define-later
export const equip = (target: Application): void => {
  target.assets.define(Dialogue, { type: 'dialogue', extensions: ['.dialogue.json'], parser: dialogueParser, loader: dialogueFactory });
};
// #endregion guide:define-later
