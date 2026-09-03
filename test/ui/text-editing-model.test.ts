import { TextEditingModel } from '#ui/TextEditingModel';

describe('TextEditingModel', () => {
  describe('insert and selection replace', () => {
    test('inserts at the caret and collapses the selection', () => {
      const model = new TextEditingModel();

      model.insert('abc');

      expect(model.value).toBe('abc');
      expect(model.selectionStart).toBe(3);
      expect(model.selectionEnd).toBe(3);
    });

    test('a non-empty selection is replaced', () => {
      const model = new TextEditingModel();

      model.insert('abcdef');
      model.setSelection(1, 4);
      model.insert('XY');

      expect(model.value).toBe('aXYef');
      expect(model.focus).toBe(3);
    });

    test('a newline is refused in a single-line model', () => {
      const model = new TextEditingModel();

      expect(model.insert('ab\ncd')).toBe(false);
      expect(model.value).toBe('');
    });

    test('a multiline model accepts newlines', () => {
      const model = new TextEditingModel({ multiline: true });

      model.insert('ab\ncd');

      expect(model.value).toBe('ab\ncd');
    });
  });

  describe('grapheme correctness', () => {
    test('backspace deletes an emoji whole, never a surrogate half', () => {
      const model = new TextEditingModel();

      model.insert('a\u{1F44D}b');
      model.setSelection(3, 3);

      expect(model.deleteContent('backward', 'character')).toBe(true);
      expect(model.value).toBe('ab');
    });

    test('backspace deletes a combining mark together with its base', () => {
      const model = new TextEditingModel();

      model.insert('e\u0301x');
      model.setSelection(2, 2);

      expect(model.deleteContent('backward', 'character')).toBe(true);
      expect(model.value).toBe('x');
    });

    test('caret motion steps over whole graphemes', () => {
      const model = new TextEditingModel();

      model.insert('a\u{1F44D}b');
      model.moveCaret('backward', 'character', false);

      expect(model.focus).toBe(3);

      model.moveCaret('backward', 'character', false);

      expect(model.focus).toBe(1);
    });
  });

  describe('word motion and word deletion', () => {
    test('moves by word segments in both directions', () => {
      const model = new TextEditingModel();

      model.insert('foo bar baz');
      model.setSelection(7, 7);
      model.moveCaret('backward', 'word', false);

      expect(model.focus).toBe(4);

      model.moveCaret('forward', 'word', false);

      expect(model.focus).toBe(7);
    });

    test('deletes the word before the caret including its trailing whitespace', () => {
      const model = new TextEditingModel();

      model.insert('foo bar ');
      expect(model.deleteContent('backward', 'word')).toBe(true);

      expect(model.value).toBe('foo ');
    });

    test('deleting a non-word character backward removes one grapheme', () => {
      const model = new TextEditingModel();

      model.insert('ab!');
      expect(model.deleteContent('backward', 'word')).toBe(true);

      expect(model.value).toBe('ab');
    });

    test('line granularity deletes to the line boundary', () => {
      const model = new TextEditingModel();

      model.insert('abcdef');
      model.setSelection(3, 3);
      model.deleteContent('backward', 'line');

      expect(model.value).toBe('def');

      model.deleteContent('forward', 'line');

      expect(model.value).toBe('');
    });
  });

  describe('maxLength', () => {
    test('refuses an insert that would overflow', () => {
      const model = new TextEditingModel({ maxLength: 5 });

      model.insert('hello');

      expect(model.insert('x')).toBe(false);
      expect(model.value).toBe('hello');
    });

    test('truncates an insert to the space left', () => {
      const model = new TextEditingModel({ maxLength: 5 });

      model.insert('hell');

      expect(model.insert('oworld')).toBe(true);
      expect(model.value).toBe('hello');
    });

    test('selection replacement frees space first', () => {
      const model = new TextEditingModel({ maxLength: 5 });

      model.insert('hello');
      model.selectAll();

      expect(model.insert('ab')).toBe(true);
      expect(model.value).toBe('ab');
    });
  });

  describe('filter', () => {
    test('rejects the whole edit when the resulting value is rejected', () => {
      const model = new TextEditingModel();

      model.filter = candidate => !candidate.includes('x');

      model.insert('ab');

      expect(model.insert('x')).toBe(false);
      expect(model.value).toBe('ab');
      expect(model.insert('c')).toBe(true);
    });

    test('a paste that fails the filter is dropped whole, not clipped', () => {
      const model = new TextEditingModel();

      model.insert('ok');
      model.filter = candidate => !candidate.includes('bad');

      expect(model.insert('a bad paste', 'paste')).toBe(false);
      expect(model.value).toBe('ok');
    });
  });

  describe('masking', () => {
    test('renderedText replaces every grapheme, the value stays clear', () => {
      const model = new TextEditingModel();

      model.maskChar = '*';
      model.insert('pa\u{1F44D}');

      expect(model.value).toBe('pa\u{1F44D}');
      expect(model.renderedText).toBe('***');
    });

    test('the in-flight composition is masked with the value', () => {
      const model = new TextEditingModel();

      model.maskChar = '*';
      model.insert('ab');
      model.setComposition({ phase: 'start' });
      model.setComposition({ phase: 'update', text: 'cd', caret: 2 });

      expect(model.renderedText).toBe('****');
      expect(model.value).toBe('ab');
    });

    test('an empty mask char does not mask', () => {
      const model = new TextEditingModel();

      model.maskChar = '';
      model.insert('ab');

      expect(model.renderedText).toBe('ab');
    });
  });

  describe('undo and redo', () => {
    test('consecutive inserts of non-whitespace coalesce into one entry', () => {
      const model = new TextEditingModel();

      model.insert('a');
      model.insert('b');
      model.insert('c');

      expect(model.undo()).toBe(true);
      expect(model.value).toBe('');

      expect(model.redo()).toBe(true);
      expect(model.value).toBe('abc');
    });

    test('whitespace closes the run', () => {
      const model = new TextEditingModel();

      model.insert('a');
      model.insert(' ');
      model.insert('b');

      expect(model.undo()).toBe(true);
      expect(model.value).toBe('a ');

      expect(model.undo()).toBe(true);
      expect(model.value).toBe('a');

      expect(model.undo()).toBe(true);
      expect(model.value).toBe('');
    });

    test('a paste starts its own entry', () => {
      const model = new TextEditingModel();

      model.insert('ab');
      model.insert('cd', 'paste');

      expect(model.undo()).toBe(true);
      expect(model.value).toBe('ab');

      expect(model.undo()).toBe(true);
      expect(model.value).toBe('');
    });

    test('a selection change closes the run', () => {
      const model = new TextEditingModel();

      model.insert('ab');
      model.setSelection(0, 0);
      model.insert('x');

      expect(model.undo()).toBe(true);
      expect(model.value).toBe('ab');

      expect(model.undo()).toBe(true);
      expect(model.value).toBe('');
    });

    test('a delete starts its own entry', () => {
      const model = new TextEditingModel();

      model.insert('abc');
      model.deleteContent('backward', 'character');

      expect(model.undo()).toBe(true);
      expect(model.value).toBe('abc');
    });

    test('the ring holds 100 entries and drops the oldest', () => {
      const model = new TextEditingModel();

      for (let i = 0; i < 120; i++) {
        model.insert('x', 'paste');
      }

      expect(model.value).toBe('x'.repeat(120));

      let undos = 0;

      while (model.undo()) {
        undos++;
      }

      expect(undos).toBe(100);
      expect(model.value).toBe('x'.repeat(20));
    });

    test('redo is cleared by a new edit', () => {
      const model = new TextEditingModel();

      model.insert('ab');
      model.undo();
      model.insert('c');

      expect(model.redo()).toBe(false);
      expect(model.value).toBe('c');
    });
  });

  describe('composition', () => {
    test('an update never changes the value and never enters history', () => {
      const model = new TextEditingModel();

      model.insert('ab');
      model.setSelection(1, 1);
      model.setComposition({ phase: 'start' });
      model.setComposition({ phase: 'update', text: 'X', caret: 1 });

      expect(model.value).toBe('ab');
      expect(model.renderedText).toBe('aXb');
      expect(model.composing).toBe(true);

      expect(model.undo()).toBe(true);
      expect(model.value).toBe('');
    });

    test('composedText carries the candidate and the focus indexes into it', () => {
      const model = new TextEditingModel();

      model.insert('ab');
      model.setSelection(1, 1);
      model.setComposition({ phase: 'start' });
      model.setComposition({ phase: 'update', text: 'kan', caret: 3 });

      // The focus sits behind the candidate, which is not in `value` at all -
      // a view has to measure caret geometry against `composedText`.
      expect(model.composedText).toBe('akanb');
      expect(model.focus).toBe(4);
      expect(model.focus).toBeGreaterThan(model.value.length);
    });

    test('the commit changes the value but creates no undo entry', () => {
      const model = new TextEditingModel();

      model.insert('ab');
      model.setSelection(2, 2);

      const values: string[] = [];

      model.onChange.add(value => values.push(value));

      model.setComposition({ phase: 'start' });
      model.setComposition({ phase: 'update', text: 'XY', caret: 2 });
      model.setComposition({ phase: 'end', text: 'XY' });

      expect(values).toEqual(['abXY']);
      expect(model.composing).toBe(false);
      expect(model.value).toBe('abXY');

      expect(model.undo()).toBe(true);
      expect(model.value).toBe('');
    });

    test('inserts are refused while composing', () => {
      const model = new TextEditingModel();

      model.insert('ab');
      model.setComposition({ phase: 'start' });

      expect(model.insert('c')).toBe(false);
      expect(model.value).toBe('ab');
    });

    test('the commit is truncated to maxLength', () => {
      const model = new TextEditingModel({ maxLength: 3 });

      model.insert('ab');
      model.setComposition({ phase: 'start' });
      model.setComposition({ phase: 'end', text: 'XYZW' });

      expect(model.value).toBe('abX');
    });

    test('the commit passes the same gates an insert does', () => {
      const digits = new TextEditingModel({ filter: value => /^[0-9]*$/.test(value) });

      digits.insert('12');
      digits.setComposition({ phase: 'start' });
      digits.setComposition({ phase: 'end', text: 'ab' });

      expect(digits.value).toBe('12');
      expect(digits.composing).toBe(false);

      const singleLine = new TextEditingModel();

      singleLine.insert('ab');
      singleLine.setComposition({ phase: 'start' });
      singleLine.setComposition({ phase: 'end', text: 'c\nd' });

      expect(singleLine.value).toBe('ab');

      const multiline = new TextEditingModel({ multiline: true });

      multiline.setComposition({ phase: 'start' });
      multiline.setComposition({ phase: 'end', text: 'c\nd' });

      expect(multiline.value).toBe('c\nd');
    });

    test('null discards an in-flight composition', () => {
      const model = new TextEditingModel();

      model.insert('ab');
      model.setComposition({ phase: 'start' });
      model.setComposition({ phase: 'update', text: 'X', caret: 1 });
      model.setComposition(null);

      expect(model.composing).toBe(false);
      expect(model.renderedText).toBe('ab');
      expect(model.value).toBe('ab');
    });
  });

  describe('setValue', () => {
    test('replaces the value and bypasses the gates', () => {
      const model = new TextEditingModel({ maxLength: 2 });

      model.setValue('abcdef');

      expect(model.value).toBe('abcdef');
      expect(model.focus).toBe(6);
    });

    test('records one undo entry', () => {
      const model = new TextEditingModel();

      model.insert('ab');
      model.setValue('xyz');

      expect(model.undo()).toBe(true);
      expect(model.value).toBe('ab');
    });
  });

  describe('wordRangeAt', () => {
    test('selects the word segment under the offset', () => {
      const model = new TextEditingModel();

      model.setValue('foo bar');

      expect(model.wordRangeAt(1)).toEqual({ start: 0, end: 3 });
      expect(model.wordRangeAt(3)).toEqual({ start: 3, end: 4 });
      expect(model.wordRangeAt(5)).toEqual({ start: 4, end: 7 });
      expect(model.wordRangeAt(7)).toEqual({ start: 4, end: 7 });
    });
  });
});
