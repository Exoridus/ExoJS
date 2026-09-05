import { Application, Color, FixedResolutionCanvasSizing, type RenderingContext, Scene, Text } from '@codexo/exojs';

const ink = new Color(232, 238, 250);
const margin = 64;

class TypographicStylingScene extends Scene {
  private readonly labels: Text[] = [];

  override init(): void {
    const { width } = this.app;
    const column = (width - margin * 2) / 2;

    // A multi-stop gradient with a CSS-style angle: 0 runs towards the top,
    // 90 towards the right, and the ramp spans the ink box corner to corner.
    this.place(
      new Text('LEVEL UP', {
        fontSize: 76,
        gradient: {
          stops: [
            { offset: 0, color: new Color(255, 255, 255) },
            { offset: 0.55, color: new Color(255, 214, 92) },
            { offset: 1, color: new Color(255, 96, 84) },
          ],
          angle: 200,
        },
      }),
      margin,
      margin,
    );

    // Small caps and oblique come from the CSS font shorthand, so a family's
    // own glyphs are used where it ships them.
    this.place(new Text('Chapter One', { fillColor: ink, fontSize: 34, fontVariant: 'small-caps' }), margin, 170);
    this.place(new Text('a passing thought', { fillColor: ink, fontSize: 26, fontStyle: 'oblique' }), margin, 220);

    // Rules are quads the layout emits per line, so they follow alignment and
    // wrapping. Without decorationColor they take the fill.
    this.place(new Text('Read the manual', { fillColor: ink, fontSize: 26, underline: true }), margin, 272);
    this.place(new Text('999 gold', { fillColor: ink, fontSize: 26, strikethrough: true, decorationColor: new Color(255, 96, 84) }), margin + column, 272);

    // A case mapping applied at layout time - the node's own text is untouched.
    this.place(new Text('quest complete', { fillColor: ink, fontSize: 26, textTransform: 'uppercase' }), margin, 326);
    this.place(new Text('the sunken keep', { fillColor: ink, fontSize: 26, textTransform: 'capitalize' }), margin + column, 326);

    // maxLines clips the line count; overflow marks the cut.
    this.place(
      new Text('The keep has stood since long before the first maps were drawn, and nobody living remembers who raised it.', {
        fillColor: ink,
        fontSize: 20,
        maxWidth: column - 24,
        maxLines: 2,
        overflow: 'ellipsis',
      }),
      margin,
      388,
    );

    // Preserved tabs advance to the next stop, so the values line up as a column.
    this.place(
      new Text('Sword\t120\nShield\t80\nPotion\t15', {
        fillColor: ink,
        fontSize: 20,
        lineHeight: 1.4,
        whiteSpace: 'pre',
        tabSize: 4,
      }),
      margin + column,
      388,
    );
  }

  override draw(context: RenderingContext): void {
    for (const label of this.labels) {
      context.render(label);
    }
  }

  private place(label: Text, x: number, y: number): void {
    label.setPosition(x, y);
    this.labels.push(label);
  }
}

const app = new Application({
  scenes: { TypographicStylingScene },
  canvas: {
    width: 1280,
    height: 720,
    mount: document.body,
    sizing: new FixedResolutionCanvasSizing(),
  },
  clearColor: new Color(18, 22, 34),
  loader: {
    basePath: 'assets/',
  },
});

await app.start(TypographicStylingScene);
