// Auto-generated from text-entry-and-scrolling.ts - edit the .ts source, not this file.
import {
  Application,
  Button,
  Color,
  FixedResolutionCanvasSizing,
  Keyboard,
  Label,
  Panel,
  Scene,
  ScrollContainer,
  Stack,
  Text,
  TextArea,
  TextInput,
} from '@codexo/exojs';
class TextEntryScene extends Scene {
  name;
  note;
  list;
  status;
  count = 0;
  init() {
    const { width } = this.app;
    const form = new Panel({ width: 430, height: 480, color: new Color(30, 42, 62), cornerRadius: 18 });
    form.setPosition(64, 100);
    const fields = new Stack({ direction: 'column', spacing: 16, padding: 24 });
    fields.addItem(new Label('Add a note', { fontSize: 32, fillColor: Color.white }));
    fields.addItem(new Label('Name', { fontSize: 20, fillColor: Color.white }));
    this.name = new TextInput({ width: 350, placeholder: 'Your name', maxLength: 24, enterKeyHint: 'next' });
    fields.addItem(this.name);
    fields.addItem(new Label('Note', { fontSize: 20, fillColor: Color.white }));
    this.note = new TextArea({ width: 350, height: 110, placeholder: 'Write a short note', maxLength: 80 });
    fields.addItem(this.note);
    const add = new Button({ width: 350, height: 48, label: 'Add to list', fontSize: 20, color: new Color(54, 120, 220), cornerRadius: 8 });
    fields.addItem(add);
    this.status = new Label('Tab between fields; wheel to scroll the list.', { fontSize: 17, fillColor: new Color(180, 205, 230) });
    fields.addItem(this.status);
    form.addChild(fields);
    this.ui.addChild(form);
    this.list = new ScrollContainer({
      width: 540,
      height: 420,
      background: new Color(25, 35, 52),
      scrollbars: 'always',
    });
    this.list.setPosition(width - 610, 142);
    this.ui.addChild(this.list);
    const title = new Label('Notes', { fontSize: 32, fillColor: Color.white });
    title.setPosition(width - 610, 100);
    this.ui.addChild(title);
    for (const [name, note] of [
      ['Mira', 'The first map is ready.'],
      ['Ash', 'Try the keyboard controls.'],
      ['Kai', 'The UI stays fixed above the scene.'],
      ['Jules', 'Drag the scrollbar thumb.'],
      ['Ari', 'The list grows as notes are added.'],
      ['Nia', 'Click a field to edit it.'],
    ]) {
      this.addNote(name, note);
    }
    this.name.onSubmit.add(() => this.note.focus());
    add.onClick.add(() => {
      const name = this.name.value.trim();
      const note = this.note.value.trim();
      if (!name || !note) {
        this.status.text = 'Enter a name and a note first.';
        return;
      }
      this.addNote(name, note);
      this.name.value = '';
      this.note.value = '';
      this.status.text = 'Note added.';
    });
    // Claim Tab so browser focus stays on the canvas while UI focus moves.
    this.inputs.onTrigger(Keyboard.Tab, () => {
      this.status.text = 'Tab moves between the fields and button.';
    });
  }
  addNote(name, note) {
    const text = new Text(`${name}: ${note.replace(/\s+/g, ' ')}`, {
      fontSize: 20,
      fillColor: this.count % 2 === 0 ? Color.white : new Color(180, 210, 255),
      maxWidth: 480,
    });
    text.setPosition(20, 24 + this.count * 76);
    this.list.content.addChild(text);
    this.count++;
  }
  draw(context) {
    context.render(this.root);
  }
}
const app = new Application({
  scenes: { TextEntryScene },
  canvas: { width: 1280, height: 720, mount: document.body, sizing: new FixedResolutionCanvasSizing() },
  clearColor: new Color(14, 20, 32),
});
await app.start(TextEntryScene);
