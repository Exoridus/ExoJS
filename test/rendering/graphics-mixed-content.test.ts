import { Color } from '#core/Color';
import { Circle } from '#math/Circle';
import { Rectangle } from '#math/Rectangle';
import { Mesh } from '#rendering/mesh/Mesh';
import { Graphics } from '#rendering/primitives/Graphics';
import { Texture } from '#rendering/texture/Texture';

const externalMesh = (texture: Texture | null = null): Mesh =>
  new Mesh({
    vertices: new Float32Array([0, 0, 1, 0, 0, 1]),
    indices: new Uint16Array([0, 1, 2]),
    ...(texture !== null && { uvs: new Float32Array([0, 0, 1, 0, 0, 1]), texture }),
  });

describe('Graphics mixed content', () => {
  test('clear() detaches an added mesh without destroying it or its texture', () => {
    const texture = new Texture();
    const external = externalMesh(texture);
    const graphics = new Graphics({ fill: Color.red });

    graphics.addChild(external);
    graphics.clear();

    expect(external.destroyed).toBe(false);
    expect(external.parent).toBeNull();
    expect(texture.destroyed).toBe(false);
    expect(graphics.children).toHaveLength(0);

    graphics.destroy();
    external.destroy();
    texture.destroy();
  });

  test('clear() destroys the meshes Graphics created itself', () => {
    const source = new Circle(0, 0, 10);
    const graphics = new Graphics({ fill: Color.red });

    graphics.addShape(source);
    graphics.fillColor = Color.blue;
    graphics.drawRectangle(0, 0, 10, 10);
    graphics.lineWidth = 2;
    graphics.drawLine(0, 0, 10, 10);

    const created = [...graphics.children];

    graphics.clear();

    expect(created.length).toBeGreaterThanOrEqual(3);
    expect(created.every(mesh => mesh.destroyed)).toBe(true);

    graphics.destroy();
    source.destroy();
  });

  test('destroy() destroys added meshes like any Container child, but not their texture', () => {
    const texture = new Texture();
    const external = externalMesh(texture);
    const graphics = new Graphics();

    graphics.addChild(external);
    graphics.destroy();

    expect(external.destroyed).toBe(true);
    expect(texture.destroyed).toBe(false);

    texture.destroy();
  });

  test('retained shapes, immediate draws and added meshes keep their insertion order', () => {
    const first = new Rectangle(0, 0, 10, 10);
    const last = new Circle(0, 0, 5);
    const external = externalMesh();
    const graphics = new Graphics({ fill: Color.red });

    graphics.addShape(first);
    graphics.fillColor = Color.blue;
    graphics.drawRectangle(20, 0, 10, 10);
    graphics.addChild(external);
    graphics.addShape(last);

    const order = [...graphics.children];

    expect(order[2]).toBe(external);

    first.width = 40;
    last.radius = 30;
    graphics.getShape(first)!.setStyle({ fill: Color.green });
    graphics.setDefaultStyle({ fill: Color.white });

    expect(graphics.children).toEqual(order);
    expect(graphics._childrenInPaintOrder()).toEqual(order);

    graphics.destroy();
    first.destroy();
    last.destroy();
  });

  test('an added mesh with a higher zIndex paints after retained shapes', () => {
    const source = new Rectangle(0, 0, 10, 10);
    const external = externalMesh();
    const graphics = new Graphics({ fill: Color.red });

    graphics.addChild(external);
    graphics.addShape(source);
    external.zIndex = 1;

    expect(graphics._childrenInPaintOrder()).toEqual([graphics.getChildAt(1), external]);

    graphics.destroy();
    source.destroy();
  });

  test('a mesh moved out of Graphics before clear() is not destroyed by it', () => {
    const graphics = new Graphics();

    graphics.fillColor = Color.red;
    graphics.drawRectangle(0, 0, 10, 10);

    const drawn = graphics.getChildAt(0);
    const other = new Graphics();

    other.addChild(drawn);
    graphics.clear();

    expect(drawn.destroyed).toBe(false);

    graphics.destroy();
    other.destroy();
  });
});
