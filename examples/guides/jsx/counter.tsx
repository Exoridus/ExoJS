import { Button, Label, live, Observable, Scene, Stack } from '@codexo/exojs';

// #region guide:counter
class CounterScene extends Scene {
  private readonly count = new Observable(0);

  override init(): void {
    const { count } = this;

    // Constructed once. Later changes of count update these nodes in place;
    // nothing is rebuilt or reconciled.
    this.ui.addChild(
      <Stack spacing={16} x={64} y={64}>
        <Label text={live`Count: ${count}`} style={{ fontSize: 40 }} />
        <Label text={count.map(n => (n % 2 === 0 ? 'even' : 'odd'))} />
        <Stack direction="row" spacing={8}>
          <Button label="-1" onClick={() => count.value--} />
          <Button label="+1" onClick={() => count.value++} />
          <Button label="Reset" visible={count.map(n => n !== 0)} onClick={() => (count.value = 0)} />
        </Stack>
      </Stack>,
    );
  }
}
// #endregion guide:counter

export { CounterScene };
