# Input

ExoJS input is centered on `InputManager` plus explicit input objects.

## Responsibilities

- keyboard state
- pointer state
- gamepad detection and mapping resolution

## Important pieces

- `InputManager`
- `Input`
- `Pointer`
- `Gamepad`
- `GamepadDefinition`

## Gamepad model

Gamepad recognition is driven by an ordered `GamepadDefinition[]` list:

- user definitions first
- built-in definitions after that
- generic fallback last

Application options use:

- `gamepadDefinitions`

not the old mapping/profile split.

## Notes

- canonical generic gamepad channel names are the intended API
- advanced backend-specific rendering is unrelated to the normal input model
