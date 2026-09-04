import { Keyboard } from '#input/types';
import { TextArea } from '#ui/TextArea';

import { createUIApp, fireBeforeInput, press, type } from '../support/text-field-harness';

// The harness atlas advances 10 per glyph; the field's content insets start at
// 8. A line box is fontSize * lineHeight + leading, taken from the field's own
// text node so the expectations follow the theme rather than restating it.
const lineBox = (field: TextArea): number => {
  const style = field.textNode.style;

  return style.fontSize * style.lineHeight + style.leading;
};

const keyDown = (harness: ReturnType<typeof createUIApp>, channel: number): void => {
  harness.signals.onKeyDown.dispatch(channel);
};

const createField = (): { harness: ReturnType<typeof createUIApp>; field: TextArea } => {
  const harness = createUIApp();
  const field = new TextArea({ width: 200, height: 120 });

  harness.scene.ui.addChild(field);
  press(harness, 5, 10);

  return { harness, field };
};

describe('TextArea', () => {
  test('Enter from the keyboard adds a line and counts it', () => {
    const { harness, field } = createField();

    type('ab');
    keyDown(harness, Keyboard.Enter);
    type('cd');

    expect(field.value).toBe('ab\ncd');
    expect(field.lineCount).toBe(2);
  });

  test('an Enter the transport already applied is not applied a second time', () => {
    const { harness, field } = createField();

    type('ab');
    // What one physical Enter produces in a browser: the host's line break
    // first, the engine's key event at the next frame boundary.
    fireBeforeInput('insertLineBreak');
    keyDown(harness, Keyboard.Enter);
    type('cd');

    expect(field.value).toBe('ab\ncd');
    expect(field.lineCount).toBe(2);
  });

  test('Home and End go to the ends of the current line, not of the value', () => {
    const { harness, field } = createField();

    type('ab');
    keyDown(harness, Keyboard.Enter);
    type('cdef');

    keyDown(harness, Keyboard.Home);
    expect(field.selectionStart).toBe(3);

    keyDown(harness, Keyboard.End);
    expect(field.selectionStart).toBe(7);
  });

  test('Up and Down move by line and keep the column', () => {
    const { harness, field } = createField();

    type('long line');
    keyDown(harness, Keyboard.Enter);
    type('ab');
    keyDown(harness, Keyboard.Enter);
    type('another line');

    // Caret is at the end of line 3 (column 12). Up lands on the short line,
    // clamped to its end; a second Up must return to column 12, not stay at 2.
    keyDown(harness, Keyboard.Up);
    expect(field.selectionStart).toBe(12);

    keyDown(harness, Keyboard.Up);
    expect(field.selectionStart).toBe(9);

    keyDown(harness, Keyboard.Down);
    keyDown(harness, Keyboard.Down);
    expect(field.selectionStart).toBe(25);
  });

  test('Up on the first line and Down on the last stay where they are', () => {
    const { harness, field } = createField();

    type('ab');
    keyDown(harness, Keyboard.Home);
    keyDown(harness, Keyboard.Up);

    expect(field.selectionStart).toBe(0);

    keyDown(harness, Keyboard.End);
    keyDown(harness, Keyboard.Down);

    expect(field.selectionStart).toBe(2);
  });

  test('shift with a vertical move extends the selection', () => {
    const { harness, field } = createField();

    type('ab');
    keyDown(harness, Keyboard.Enter);
    type('cd');

    harness.signals.onKeyDown.dispatch(Keyboard.ShiftLeft);
    keyDown(harness, Keyboard.Up);

    expect(field.selectionStart).toBe(2);
    expect(field.selectionEnd).toBe(5);
  });

  test('a pointer press picks the line the point falls on', () => {
    const { harness, field } = createField();

    type('ab');
    keyDown(harness, Keyboard.Enter);
    type('cdef');

    // Half way down the second line box, and inside the second line's glyph 2.
    const y = field.textNode.y + lineBox(field) * 1.5;

    press(harness, field.textNode.x + 22, y);
    expect(field.selectionStart).toBe(5);
  });

  test('a value taller than the field scrolls to keep the caret visible', () => {
    const { harness, field } = createField();
    const unscrolledY = field.textNode.y;

    for (let line = 0; line < 12; line++) {
      type('x');
      keyDown(harness, Keyboard.Enter);
    }

    // The text node rides negative y once the caret leaves the viewport.
    expect(field.textNode.y).toBeLessThan(0);

    keyDown(harness, Keyboard.PageUp);
    keyDown(harness, Keyboard.PageUp);
    keyDown(harness, Keyboard.PageUp);

    expect(field.selectionStart).toBe(0);
    expect(field.textNode.y).toBe(unscrolledY);
  });

  test('a line too long for the field wraps without gaining a line break', () => {
    const harness = createUIApp();
    // 200px wide, 8px insets on both sides: 18 glyphs at advance 10 fit, the
    // rest of the sentence has to move down.
    const field = new TextArea({ width: 200, height: 120, value: 'alpha beta gamma delta epsilon' });

    harness.scene.ui.addChild(field);

    expect(field.wrap).toBe(true);
    expect(field.lineCount).toBe(1);
    expect(field.textNode.currentLayout.lines.length).toBeGreaterThan(1);
    expect(field.value).not.toContain('\n');
  });

  test('turning wrapping off puts the whole line back on one row', () => {
    const harness = createUIApp();
    const field = new TextArea({ width: 200, height: 120, value: 'alpha beta gamma delta epsilon', wrap: false });

    harness.scene.ui.addChild(field);

    expect(field.textNode.currentLayout.lines).toHaveLength(1);
  });

  test('the caret follows a wrapped line rather than the value line', () => {
    const harness = createUIApp();
    const field = new TextArea({ width: 200, height: 120, value: 'alpha beta gamma delta epsilon' });

    harness.scene.ui.addChild(field);
    press(harness, 5, 10);

    const layout = field.textNode.currentLayout;
    const secondLine = layout.lines[1]!;

    // Clicking the second visual row must select an offset from the second
    // row's own source range, which only exists because the layout carries it.
    press(harness, field.textNode.x + 5, field.textNode.y + lineBox(field) * 1.5);

    expect(field.selectionStart).toBeGreaterThanOrEqual(secondLine.sourceStart);
    expect(field.selectionStart).toBeLessThanOrEqual(secondLine.sourceEnd);
  });

  test('the scrollbar appears once the value outgrows the field and drives the scroll', () => {
    const { harness, field } = createField();
    const bar = field.verticalScrollbar!;
    const unscrolledY = field.textNode.y;

    expect(bar.visible).toBe(false);

    for (let line = 0; line < 12; line++) {
      type('x');
      keyDown(harness, Keyboard.Enter);
    }

    expect(bar.visible).toBe(true);
    expect(bar.offset).toBeGreaterThan(0);
    expect(field.textNode.y).toBeLessThan(unscrolledY);

    // What a thumb drag back to the top reports.
    bar.onScroll.dispatch(0, bar);

    expect(bar.offset).toBe(0);
    expect(field.textNode.y).toBe(unscrolledY);
  });

  test('a field built without a scrollbar has none', () => {
    const harness = createUIApp();
    const field = new TextArea({ width: 200, height: 120, scrollbar: false });

    harness.scene.ui.addChild(field);

    expect(field.verticalScrollbar).toBeNull();
  });

  test('maxLength and filter gate the value the same way they do in a single-line field', () => {
    const harness = createUIApp();
    const field = new TextArea({ width: 200, height: 120, maxLength: 4, filter: candidate => !candidate.includes('!') });

    harness.scene.ui.addChild(field);
    press(harness, 5, 10);

    type('abcdef');
    expect(field.value).toBe('abcd');

    fireBeforeInput('insertText', { data: '!' });
    expect(field.value).toBe('abcd');
  });
});
