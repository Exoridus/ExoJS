/** @jsxImportSource @codexo/exojs */
import { bindProperty, Button, Container, Label, live, Observable, Panel, type Sprite, Stack, type WritableKeys } from '@codexo/exojs';

declare const sprite: Sprite;
declare const label: Label;

const health = new Observable(100);
const name = new Observable('Hero');
const alive = health.map(n => n > 0);

// Bindings write through native setters and keep the property type.
export const unbindX: () => void = bindProperty(sprite, 'x', health);
bindProperty(sprite, 'visible', alive);
bindProperty(label, 'text', name);
bindProperty(label, 'text', live`HP ${health}`);
// Numbers convert only for string properties.
bindProperty(label, 'text', health);
// @ts-expect-error visible is boolean, not string
bindProperty(sprite, 'visible', name);
// @ts-expect-error numbers do not convert to booleans
bindProperty(sprite, 'visible', health);
// @ts-expect-error destroyed is a getter-only accessor
bindProperty(sprite, 'destroyed', alive);
// @ts-expect-error onPointerDown is a read-only signal
bindProperty(sprite, 'onPointerDown', alive);
// @ts-expect-error methods are not bindable
bindProperty(sprite, 'destroy', alive);
const sample: WritableKeys<{ readonly a: number; b: string; c(): void }> = 'b';
// @ts-expect-error a is readonly
export const readonlyKey: WritableKeys<{ readonly a: number; b: string }> = 'a';
export { sample };

// JSX accepts observables for node properties and for writable construction props.
export const hud = (
  <Stack spacing={8}>
    <Label text={live`Health: ${health}`} />
    <Label text={health} />
    <Label text={name} x={health} />
    <Button label={name} />
    <Panel visible={health.map(n => n <= 0)}>
      <Label text="Game Over" />
    </Panel>
  </Stack>
);
// @ts-expect-error visible needs an observable boolean
export const wrongVisible = <Container visible={health} />;
// @ts-expect-error spacing is a construction option without a matching writable property type
export const wrongSpacing = <Stack spacing={name} />;
// @ts-expect-error handlers are functions, never observables
export const observedHandler = <Button onClick={alive} />;
