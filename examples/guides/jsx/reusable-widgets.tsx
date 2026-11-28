import { Button, Color, Container, Graphics, Label, Panel, ProgressBar, Scene, Stack } from '@codexo/exojs';
import type { JSX, JsxAdapterProps, JsxChildren } from '@codexo/exojs/jsx';
import { jsxConstruct } from '@codexo/exojs/jsx';

// #region guide:element-function
interface StatRowProps {
  readonly label: string;
  readonly value: number;
  readonly color?: Color;
}

/** An element function: typed props in, an ordinary node out. */
const StatRow = (props: StatRowProps): JSX.Element => (
  <Stack direction="row" spacing={10} align="center">
    <Label text={props.label} />
    <ProgressBar width={160} height={12} value={props.value} fillColor={props.color ?? Color.green} />
  </Stack>
);

interface CardProps {
  readonly title: string;
  readonly onClose: () => void;
  readonly children?: JsxChildren;
}

const Card = (props: CardProps): JSX.Element => (
  <Panel width={300} height={200}>
    <Stack spacing={10} padding={16}>
      <Label text={props.title} style={{ fontSize: 22 }} />
      {props.children}
      <Button label="Close" onClick={props.onClose} />
    </Stack>
  </Panel>
);
// #endregion guide:element-function

// #region guide:custom-class
/** A custom node whose constructor takes positional arguments, made constructible from JSX by an adapter. */
class Gem extends Container {
  public constructor(
    public readonly color: Color,
    public readonly size: number,
  ) {
    super();
    const shape = new Graphics();
    shape.fillColor = color;
    shape.drawCircle(0, 0, size);
    this.addChild(shape);
  }

  public static [jsxConstruct](props: JsxAdapterProps<{ readonly color: Color; readonly size?: number }>): Gem {
    return new this(props.color, props.size ?? 12);
  }
}
// #endregion guide:custom-class

// #region guide:compose
class CharacterScene extends Scene {
  override init(): void {
    const card = (
      <Card title="Hero" onClose={() => card.destroy()}>
        <StatRow label="HP" value={0.8} />
        <StatRow label="MP" value={0.35} color={Color.blue} />
        <Stack direction="row" spacing={8}>
          <Gem color={Color.red} />
          <Gem color={Color.cyan} size={8} />
        </Stack>
      </Card>
    );

    this.ui.addChild(card);
  }
}
// #endregion guide:compose

export { CharacterScene };
