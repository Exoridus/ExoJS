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
  Text,
  TextArea,
  TextInput,
} from '@codexo/exojs';
import { mountControls, siteUITheme } from '@examples/runtime';

class TextEntryScene extends Scene {
  private name!: TextInput;
  private note!: TextArea;
  private list!: ScrollContainer;
  private form!: Panel;
  private title!: Label;
  private caption!: ReturnType<typeof mountControls>;
  private count = 0;
  private notes: Text[] = [];
  private scrollPending = false;

  override init(): void {
    this.ui.theme = siteUITheme();
    this.caption = mountControls({
      theme: 'site',
      title: 'Text Entry and Scrolling',
      hint: 'Tab between fields and Add. Enter in Name focuses Note. Wheel or drag the list.',
    });
    this.caption.setStatus('Write a note; adding it scrolls to the new row.');
    this.form = new Panel({ width: 240, height: 198, color: new Color(25, 31, 36), cornerRadius: 8 });
    const nameLabel = new Label('Name', { fontSize: 14, fillColor: Color.white }).setPosition(10, 10);
    this.name = new TextInput({
      width: 220,
      height: 32,
      placeholder: 'Your name',
      maxLength: 24,
      enterKeyHint: 'next',
      textStyle: { fontSize: 14 },
    });
    this.name.setPosition(10, 30);
    const noteLabel = new Label('Note', { fontSize: 14, fillColor: Color.white }).setPosition(10, 68);
    this.note = new TextArea({ width: 220, height: 58, placeholder: 'Write a short note', maxLength: 80, textStyle: { fontSize: 14 } });
    this.note.setPosition(10, 88);
    const add = new Button({ width: 220, height: 32, label: 'Add to list', fontSize: 14 });
    add.setPosition(10, 152);
    this.form.addChild(nameLabel, this.name, noteLabel, this.note, add);
    this.ui.addChild(this.form);
    this.list = new ScrollContainer({ width: 240, height: 200, background: new Color(18, 24, 29), scrollbars: 'always' });
    this.title = new Label('Notes', { fontSize: 16, fillColor: Color.white });
    this.ui.addChild(this.list, this.title);

    for (const [name, note] of [
      ['Mira', 'The first map is ready.'],
      ['Ash', 'Try the keyboard controls.'],
      ['Kai', 'UI stays above the scene.'],
      ['Jules', 'Drag the scrollbar thumb.'],
      ['Ari', 'New notes appear at the end.'],
      ['Nia', 'Click a field to edit it.'],
    ]) {
      this.addNote(name, note);
    }

    this.list.scrollTo(0, 0);
    this.name.onSubmit.add(() => this.note.focus());
    add.onClick.add(() => {
      const name = this.name.value.trim();
      const note = this.note.value.trim();

      if (!name || !note) {
        this.caption.setStatus('Enter both a name and a note.');

        return;
      }

      this.addNote(name, note);
      this.name.value = '';
      this.note.value = '';
      this.scrollPending = true;
      this.caption.setStatus(`Note ${this.count} added; list scrolled to the new row.`);
    });
    this.inputs.onTrigger(Keyboard.Tab);
  }

  private addNote(name: string, note: string): void {
    const text = new Text(`${name}: ${note.replace(/\s+/g, ' ')}`, {
      fontSize: 14,
      fillColor: this.count % 2 === 0 ? Color.white : new Color(168, 175, 181),
      maxWidth: 204,
    });
    text.setPosition(10, 12 + this.count * 64);
    this.list.content.addChild(text);
    this.notes.push(text);
    this.count++;
  }

  override update(): void {
    const { scale: k, width, height, contentHeight } = this.caption.fit(this.app, this.app.canvas as HTMLCanvasElement);
    const top = height - contentHeight;
    this.ui.uiScale = k;
    this.form.setPosition(12, top);
    this.title.setPosition(266, top);
    this.list.setPosition(266, top + 26);
    const listWidth = Math.min(520, width - 278);
    this.list.setSize(listWidth, Math.min(360, Math.max(80, contentHeight - 38)));

    for (const note of this.notes) {
      if (note.layout.maxWidth !== listWidth - 36) {
        note.layout = { maxWidth: listWidth - 36 };
      }
    }

    if (this.scrollPending) {
      this.list.scrollTo(0, Infinity);
      this.scrollPending = false;
    }
  }

  override destroy(): void {
    this.caption?.dispose();
    super.destroy();
  }
}
const app = new Application({
  scenes: { TextEntryScene },
  canvas: { width: 1280, height: 720, mount: document.body, sizing: new FixedResolutionCanvasSizing() },
  clearColor: new Color(11, 16, 20),
});
await app.start(TextEntryScene);
