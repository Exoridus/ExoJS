import { Application, Color, Scene, Sound, Sprite, Text } from '@codexo/exojs';
import { mountControlPanel, mountControls } from '@examples/runtime';

const app = new Application({
    canvas: {
        width: 1280,
        height: 720,
        mount: document.body,
        sizingMode: 'fit',
    },
    clearColor: Color.black,
});

interface DialogLine {
    speaker: string;
    text: string;
}

const lines: DialogLine[] = [
    { speaker: 'Commander Vale', text: 'Commander, the anomaly has entered low orbit.' },
    { speaker: 'Commander Vale', text: 'All wings hold formation and await my signal.' },
    { speaker: 'Commander Vale', text: 'If this goes wrong, burn every gate behind us.' },
];

const choices = ['Hold formation', 'Burn the gates'];

class DialogSystemScene extends Scene {
    private portrait!: Sprite;
    private namePlate!: Text;
    private box!: Text;
    private choicePrompt!: Text;
    private beep!: Sound;
    private hud!: ReturnType<typeof mountControls>;
    private panel!: ReturnType<typeof mountControlPanel>;
    private lineIndex = 0;
    private chars = 0;
    private timer = 0;
    private done = false;
    private awaitingChoice = false;

    override init(): void {
        const { width, height } = this.app.canvas;

        // Portrait sits on the left; the dialog column runs to its right and
        // fills the wider 16:9 frame as a classic VN bottom-third box.
        this.portrait = new Sprite(this.loader.get(assets.demo.textures.shipA)).setAnchor(0.5).setScale(2.4).setPosition(width * 0.16, height * 0.62);

        const textX = width * 0.3;

        // Name plate sits just above the dialog body, like a classic VN UI.
        this.namePlate = new Text(lines[0].speaker, { fillColor: new Color(255, 214, 120), fontSize: 26, fontWeight: 'bold' });
        this.namePlate.setPosition(textX, height * 0.5);

        this.box = new Text('', { fillColor: Color.white, fontSize: 32, lineHeight: 1.3, maxWidth: width * 0.55 });
        this.box.setPosition(textX, height * 0.56);

        this.choicePrompt = new Text('', { fillColor: new Color(150, 220, 255), fontSize: 20 });
        this.choicePrompt.setPosition(textX, height * 0.78);

        this.beep = this.loader.get(assets.demo.sound.uiConfirm);

        this.hud = mountControls({
            title: 'Dialog System',
            controls: [{ keys: 'Click', action: 'advance / reveal' }],
            hint: 'Click anywhere to skip the typewriter, then click again to continue.',
        });

        // Choice buttons live in a predictable DOM panel so they never compete
        // with the canvas pointer for "advance" taps. They stay hidden until the
        // final line finishes typing.
        this.panel = mountControlPanel({ title: 'Your reply', corner: 'bottom-left' });
        for (const choice of choices) {
            this.panel.addButton({ label: choice, onClick: () => this.choose(choice) });
        }
        this.setChoicesVisible(false);

        this.app.input.onPointerTap.add(() => this.advance());
    }

    private advance(): void {
        if (this.awaitingChoice) {
            return;
        }

        if (!this.done) {
            // First click reveals the rest of the current line instantly.
            this.chars = lines[this.lineIndex].text.length;
            this.done = true;
            return;
        }

        if (this.lineIndex < lines.length - 1) {
            this.lineIndex++;
            this.startLine();
            return;
        }

        // The last line is read — offer the choice row.
        this.awaitingChoice = true;
        this.setChoicesVisible(true);
    }

    private startLine(): void {
        this.chars = 0;
        this.timer = 0;
        this.done = false;
        this.namePlate.text = lines[this.lineIndex].speaker;
    }

    private choose(choice: string): void {
        this.app.audio.play(this.beep, { playbackRate: 1.2, volume: 0.3 });
        this.choicePrompt.text = `You chose: ${choice}`;
        this.hud.setStatus(`Reply: ${choice}`);
        this.awaitingChoice = false;
        this.setChoicesVisible(false);
        // Loop back to the top so the demo can be replayed without a reload.
        this.lineIndex = 0;
        this.startLine();
    }

    private setChoicesVisible(visible: boolean): void {
        this.panel.element.style.display = visible ? '' : 'none';
        this.choicePrompt.visible = !visible && this.choicePrompt.text.length > 0;
    }

    override update(delta): void {
        if (!this.done && !this.awaitingChoice) {
            this.timer += delta.seconds;
            while (this.timer > 0.035 && this.chars < lines[this.lineIndex].text.length) {
                this.timer -= 0.035;
                this.chars++;
                this.app.audio.play(this.beep, { playbackRate: 1.9, volume: 0.14 });
            }
            this.done = this.chars >= lines[this.lineIndex].text.length;
        }
        this.box.text = lines[this.lineIndex].text.slice(0, this.chars);
    }

    override draw(context): void {
        context.backend.clear(new Color(20, 24, 34));
        context.render(this.portrait);
        context.render(this.namePlate);
        context.render(this.box);
        if (this.choicePrompt.visible) {
            context.render(this.choicePrompt);
        }
    }
}

app.start(new DialogSystemScene());
