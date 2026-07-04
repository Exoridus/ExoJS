// Auto-generated from multiline-and-wrap.ts — edit the .ts source, not this file.
import { Application, Color, Scene, Text } from '@codexo/exojs';
const app = new Application({
    canvas: {
        width: 1280,
        height: 720,
        mount: document.body,
        sizingMode: 'fit',
    },
    clearColor: Color.black,
});
const paragraph = 'ExoJS text layout can render multiline content with configurable wrapping behavior and style.';
const longToken = 'ExoJStextlayoutrendersaverylongunbrokentokenwithoutanyspacestobreakon';
const titleColor = new Color(140, 170, 210);
class MultilineAndWrapScene extends Scene {
    titleA;
    textA;
    titleB;
    textB;
    titleC;
    textC;
    init() {
        const { width, height } = this.app.canvas;
        // Three wrap modes side by side across the 16:9 canvas: one column each.
        const colWidth = width / 3;
        const titleY = height * 0.16;
        const bodyY = height * 0.16 + 36;
        const colX = (index) => colWidth * index + (colWidth - 360) / 2;
        this.titleA = new Text('Word wrap @ 360px — at word boundaries', { fillColor: titleColor, fontSize: 16 });
        this.titleA.setPosition(colX(0), titleY);
        this.textA = new Text(paragraph, { fillColor: Color.white, fontSize: 22, maxWidth: 360 });
        this.textA.setPosition(colX(0), bodyY);
        this.titleB = new Text('Break words @ 280px — splits a token', { fillColor: titleColor, fontSize: 16 });
        this.titleB.setPosition(colX(1), titleY);
        this.textB = new Text(longToken, { fillColor: Color.white, fontSize: 22, maxWidth: 280, breakWords: true });
        this.textB.setPosition(colX(1), bodyY);
        // No-wrap goes in the LAST column on purpose: its single line overflows
        // off the right canvas edge, demonstrating the overflow without running
        // across (and visually breaking) the other two columns.
        this.titleC = new Text('No wrap — single line overflows', { fillColor: titleColor, fontSize: 16 });
        this.titleC.setPosition(colX(2), titleY);
        this.textC = new Text(paragraph, { fillColor: Color.white, fontSize: 22 });
        this.textC.setPosition(colX(2), bodyY);
    }
    draw(context) {
        context.backend.clear();
        context.render(this.titleA);
        context.render(this.titleB);
        context.render(this.titleC);
        context.render(this.textA);
        context.render(this.textB);
        context.render(this.textC);
    }
}
app.start(new MultilineAndWrapScene());
