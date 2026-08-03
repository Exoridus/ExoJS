// Type contract for the input action layer.
//
// Actions take one binding directly or several as an array, with the options
// object always a separate second parameter — there are no variadic
// constructors where the last argument could be either. Composite bindings
// must carry at least one source, and an `ActionMap` must expose the actions
// it was built from as own members with their concrete types preserved.
//
// `pnpm typecheck:type-tests` compiles this file under `tsconfig.type-tests.json`
// (the example project's settings), both at its default strictness and again
// with `--strictNullChecks false` on the command line. It is NOT part of
// `tsconfig.type-tests-strict.json`'s include list (that lane is scoped to
// the catalog-input/-leaf overloads only) — every assertion below must hold
// under both lanes it does run in.

import { ActionMap, AxisAction, ButtonAction, GamepadAxis, GamepadButton, Keyboard, PointerButton, VectorAction } from '@codexo/exojs';

type Equal<A, B> = (<G>() => G extends A ? 1 : 2) extends <G>() => G extends B ? 1 : 2 ? true : false;

declare function expectType<_T extends true>(): void;

// ---------------------------------------------------------------------------
// ButtonAction
// ---------------------------------------------------------------------------

export function buttonActionAcceptsOneOrManySources(): void {
  const single = new ButtonAction(Keyboard.Space);
  const many = new ButtonAction([Keyboard.Space, GamepadButton.South]);
  const pointer = new ButtonAction(PointerButton.Primary);
  const withOptions = new ButtonAction(GamepadButton.RightTrigger, { threshold: 0.5 });

  expectType<Equal<typeof single.value, number>>();
  expectType<Equal<typeof many.active, boolean>>();
  expectType<Equal<typeof pointer.pressed, boolean>>();
  expectType<Equal<typeof withOptions.released, boolean>>();
}

export function buttonActionRejectsBadArguments(): void {
  // @ts-expect-error -- options are a separate parameter, never a binding
  new ButtonAction({ threshold: 0.5 });

  // @ts-expect-error -- a composite is not a button source
  new ButtonAction({ negative: Keyboard.A, positive: Keyboard.D });

  // @ts-expect-error -- a binding is required
  new ButtonAction();
}

// ---------------------------------------------------------------------------
// AxisAction
// ---------------------------------------------------------------------------

export function axisActionAcceptsSignedAndCompositeBindings(): void {
  const direct = new AxisAction(GamepadAxis.LeftStickX);
  const composite = new AxisAction({ negative: Keyboard.A, positive: Keyboard.D });
  const multiSource = new AxisAction({ negative: [Keyboard.A, Keyboard.Left], positive: [Keyboard.D, Keyboard.Right] });
  const mixed = new AxisAction([GamepadAxis.LeftStickX, { negative: Keyboard.A, positive: Keyboard.D }]);
  const positiveOnly = new AxisAction({ positive: [Keyboard.W, GamepadButton.RightTrigger] });
  const negativeOnly = new AxisAction({ negative: Keyboard.S });

  expectType<Equal<typeof direct.value, number>>();
  expectType<Equal<typeof composite.active, boolean>>();
  expectType<Equal<typeof multiSource.value, number>>();
  expectType<Equal<typeof mixed.value, number>>();
  expectType<Equal<typeof positiveOnly.value, number>>();
  expectType<Equal<typeof negativeOnly.value, number>>();
}

export function axisActionRejectsBadArguments(): void {
  // @ts-expect-error -- a composite needs at least one side
  new AxisAction({});

  // @ts-expect-error -- `up` belongs to a vector binding, not an axis
  new AxisAction({ up: Keyboard.W });
}

// ---------------------------------------------------------------------------
// VectorAction
// ---------------------------------------------------------------------------

export function vectorActionAcceptsAxesAndDirections(): void {
  const stick = new VectorAction({ x: GamepadAxis.LeftStickX, y: GamepadAxis.LeftStickY });
  const wasd = new VectorAction({ up: Keyboard.W, down: Keyboard.S, left: Keyboard.A, right: Keyboard.D });
  const both = new VectorAction([
    { x: GamepadAxis.LeftStickX, y: GamepadAxis.LeftStickY },
    { up: Keyboard.W, down: Keyboard.S, left: Keyboard.A, right: Keyboard.D },
  ]);
  const horizontalOnly = new VectorAction({ left: Keyboard.A, right: Keyboard.D });
  const verticalAxisOnly = new VectorAction({ y: GamepadAxis.LeftStickY });
  const singleDirection = new VectorAction({ down: Keyboard.S });

  expectType<Equal<typeof stick.value.x, number>>();
  expectType<Equal<typeof wasd.active, boolean>>();
  expectType<Equal<typeof both.value.y, number>>();
  expectType<Equal<typeof horizontalOnly.active, boolean>>();
  expectType<Equal<typeof verticalAxisOnly.active, boolean>>();
  expectType<Equal<typeof singleDirection.active, boolean>>();
}

export function vectorActionRejectsBadArguments(): void {
  // @ts-expect-error -- a vector binding needs at least one source
  new VectorAction({});

  // @ts-expect-error -- `negative`/`positive` belong to an axis binding
  new VectorAction({ negative: Keyboard.A, positive: Keyboard.D });
}

// ---------------------------------------------------------------------------
// ActionMap
// ---------------------------------------------------------------------------

export function actionMapPreservesMemberTypes(): void {
  const controls = new ActionMap({
    jump: new ButtonAction([Keyboard.Space, GamepadButton.South]),
    steer: new AxisAction([GamepadAxis.LeftStickX, { negative: Keyboard.A, positive: Keyboard.D }]),
    move: new VectorAction({ up: Keyboard.W, down: Keyboard.S, left: Keyboard.A, right: Keyboard.D }),
  });

  expectType<Equal<typeof controls.jump, ButtonAction>>();
  expectType<Equal<typeof controls.steer, AxisAction>>();
  expectType<Equal<typeof controls.move, VectorAction>>();
  expectType<Equal<typeof controls.jump.pressed, boolean>>();
  expectType<Equal<typeof controls.steer.value, number>>();
  expectType<Equal<typeof controls.attached, boolean>>();
}

export function actionMapRejectsUnknownMembers(): void {
  const controls = new ActionMap({ jump: new ButtonAction(Keyboard.Space) });

  // @ts-expect-error -- only declared actions are members
  expectType<Equal<typeof controls.crouch, never>>();

  // @ts-expect-error -- an action map holds actions, not arbitrary values
  new ActionMap({ speed: 4 });
}
