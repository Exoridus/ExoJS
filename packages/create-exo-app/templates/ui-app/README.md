# UI app template

A settings screen built from the UI widgets in `@codexo/exojs`. No extension
packages and no assets — the widget set, the theme and the text rendering are
all in core.

## Where things are

`src/scenes/SettingsScene.ts` is the whole app. Widgets live on `scene.ui`, a
screen-fixed layer the engine renders above the world without being asked to,
and anchor to the screen edges rather than to absolute positions, so the layout
survives a resize.

## The pattern worth copying

Nothing reads a value back out of a widget. Each control writes into a draft
object on change, `Apply` copies the draft into the applied state, and the
summary panel renders from the applied state alone.

That separation is what lets you add a control without touching anything that
consumes the settings, and it is what makes `Revert` a two-line method instead
of a walk over every widget on screen.

## Theming

Every widget resolves its colours from the inherited `UITheme` and its own
interaction state. `createUITheme` and `defaultUITheme` are exported from core:
patch the roles you care about and pass the result down, rather than styling
widgets one at a time.
