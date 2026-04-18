import { Color, Graphics, createRapierPhysicsWorld } from 'exojs';

async function setupPhysics(player: Graphics): Promise<void> {
    const physics = await createRapierPhysicsWorld({ gravityY: 9.81 });

    physics.attachNode(player, {
        type: 'dynamic',
        shape: { type: 'box', width: 24, height: 24 },
        collisionFilter: {
            membership: 1,
            collidesWith: [2],
        },
    });

    const ground = new Graphics();

    ground.fillColor = Color.darkSlateGray;
    ground.drawRectangle(0, 0, 500, 20);
    ground.setPosition(250, 380);

    physics.attachNode(ground, {
        type: 'static',
        shape: { type: 'box', width: 500, height: 20 },
        collisionFilter: {
            membership: 2,
            collidesWith: [1],
        },
    });

    const triggerZone = new Graphics();

    triggerZone.fillColor = new Color(255, 180, 48, 0.2);
    triggerZone.drawCircle(0, 0, 48);
    triggerZone.setPosition(300, 300);

    physics.attachNode(triggerZone, {
        type: 'static',
        shape: { type: 'circle', radius: 48 },
        trigger: true,
    });

    physics.onTriggerEnter.add((event) => {
        console.log('trigger enter', event.first.colliderHandle, event.second.colliderHandle);
    });

    const debug = physics.createDebugGraphics();

    // Inside your scene update:
    // physics.step(delta.seconds);

    // Inside your scene draw:
    // physics.updateDebugGraphics(debug);
    // debug.render(runtime);
}

export { setupPhysics };
