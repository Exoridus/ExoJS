import { Application, Color, Graphics, Scene, View } from '@codexo/exojs';

const app = new Application({
    canvas: {
        width: 800,
        height: 600,
    },
    clearColor: Color.black,
    loader: {
        basePath: 'assets/',
    },
});

document.body.append(app.canvas);

class PointerToWorldScene extends Scene {
    private view!: View;
    private grid!: Graphics;
    private markers!: Graphics;

    override init(): void {
        this.view = new View(260, 180, 800, 600);
        this.grid = new Graphics();
        this.markers = new Graphics();

        this.grid.lineWidth = 1;
        this.grid.lineColor = new Color(70, 70, 70);
        for (let x = -400; x <= 1200; x += 80) this.grid.drawLine(x, -300, x, 1000);
        for (let y = -300; y <= 1000; y += 80) this.grid.drawLine(-400, y, 1200, y);

        this.app.input.onPointerTap.add(pointer => {
            const world = this.toWorld(pointer.x, pointer.y);
            this.markers.fillColor = new Color(255, 160, 80);
            this.markers.drawCircle(world.x, world.y, 6);
        });
    }

    private toWorld(screenX: number, screenY: number): { x: number; y: number } {
        const width = this.app.canvas.width;
        const height = this.app.canvas.height;
        const clipX = (screenX / width) * 2 - 1;
        const clipY = 1 - (screenY / height) * 2;
        const matrix = this.view.getInverseTransform();

        return {
            x: matrix.a * clipX + matrix.b * clipY + matrix.x,
            y: matrix.c * clipX + matrix.d * clipY + matrix.y,
        };
    }

    override draw(context): void {
        context.backend.clear();
        context.backend.setView(this.view);
        context.render(this.grid);
        context.render(this.markers);
        context.backend.setView(null);
    }
}

app.start(new PointerToWorldScene());
