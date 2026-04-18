import { Rectangle, View, type SceneNode } from 'exojs';

interface PlayerLike extends SceneNode {
    x: number;
    y: number;
}

function configureCamera(view: View, player: PlayerLike): void {
    view.follow(player, {
        lerp: 0.12,
        offsetX: 0,
        offsetY: -20,
    });

    view.setBounds(new Rectangle(0, 0, 4000, 2000));
    view.setZoom(1.2);
}

function onPlayerImpact(view: View): void {
    view.shake(8, 180, {
        frequency: 14,
        decay: true,
    });
}

export { configureCamera, onPlayerImpact };
