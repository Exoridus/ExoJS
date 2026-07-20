import { Application, Button, Color, Label, Panel, ProgressBar, type RenderingContext, Scene, Stack, type Time } from '@codexo/exojs';



/**
 * UI-Core showcase: a screen-fixed HUD and interactive widgets live on
 * `scene.ui`, which is auto-rendered above the world. Widgets anchor to the
 * screen edges and re-layout on resize; buttons are clickable and keyboard-
 * focusable (Tab to move focus, Enter / Space to activate).
 */
class HudScene extends Scene {
    private score = 0;
    private health = 1;
    private scoreLabel!: Label;
    private healthBar!: ProgressBar;
    private spinner!: Panel;
    private angle = 0;

    override init(): void {
        // A bit of "world" content so the UI clearly sits on top of it.
        this.spinner = new Panel({ width: 160, height: 160, color: new Color(60, 130, 235, 1), cornerRadius: 24 });
        this.spinner.setAnchor(0.5, 0.5);
        this.spinner.setPosition(640, 360);
        this.addChild(this.spinner);

        // HUD: score + health anchored to the top-left corner.
        this.scoreLabel = new Label('Score: 0', { fontSize: 26 });
        this.scoreLabel.anchorIn(this.ui, 'top-left', 24, 20);
        this.ui.addChild(this.scoreLabel);

        this.healthBar = new ProgressBar({ width: 260, height: 16, value: 1 });
        this.healthBar.anchorIn(this.ui, 'top-left', 24, 60);
        this.ui.addChild(this.healthBar);

        // A panel of stacked buttons anchored to the bottom-right corner.
        const panel = new Panel({ borderColor: new Color(255, 255, 255, 0.16), borderWidth: 1 });
        const buttons = new Stack({ direction: 'column', spacing: 10, padding: 14 });

        buttons.addItem(this.makeButton('+10 Score', new Color(54, 120, 220, 1), () => {
            this.score += 10;
            this.scoreLabel.text = `Score: ${this.score}`;
        }));
        buttons.addItem(this.makeButton('Take Damage', new Color(214, 92, 84, 1), () => {
            this.health = Math.max(0, this.health - 0.2);
            this.healthBar.value = this.health;
        }));
        buttons.addItem(this.makeButton('Reset', new Color(90, 96, 110, 1), () => {
            this.score = 0;
            this.health = 1;
            this.scoreLabel.text = 'Score: 0';
            this.healthBar.value = 1;
        }));

        panel.setSize(buttons.uiWidth, buttons.uiHeight);
        panel.addChild(buttons);
        panel.anchorIn(this.ui, 'bottom-right', -24, -24);
        this.ui.addChild(panel);
    }

    override update(delta: Time): void {
        this.angle += delta.seconds * 60;
        this.spinner.setRotation(this.angle);
    }

    override draw(context: RenderingContext): void {
        // scene.root is explicit; scene.ui is auto-rendered above it.
        context.render(this.root);
    }

    private makeButton(label: string, color: Color, onClick: () => void): Button {
        const button = new Button({ label, color, width: 160, height: 44 });

        button.onClick.add(onClick);

        return button;
    }
}

const app = new Application({
    scenes: { HudScene },
    canvas: {
        width: 1280,
        height: 720,
        mount: document.body,
        sizingMode: 'fit',
    },
    clearColor: new Color(18, 22, 32),
});

void app.start(HudScene);
