import { DockContainer } from '#ui/DockContainer';
import { Panel } from '#ui/Panel';
import { Stack } from '#ui/Stack';

describe('Stack reactivity', () => {
  test('flows a child added with addChild, without an explicit layout call', () => {
    const stack = new Stack({ direction: 'column', spacing: 10 });
    const a = new Panel({ width: 100, height: 30 });
    const b = new Panel({ width: 80, height: 40 });

    stack.addChild(a, b);

    expect(b.position.y).toBe(40);
    expect(stack.uiHeight).toBe(80);
  });

  test('re-flows when a child is removed', () => {
    const stack = new Stack({ direction: 'column', spacing: 10 });
    const a = new Panel({ width: 100, height: 30 });
    const b = new Panel({ width: 80, height: 40 });

    stack.addChild(a, b);
    stack.removeChild(a);

    expect(b.position.y).toBe(0);
    expect(stack.uiHeight).toBe(40);
  });

  test('re-flows when a child resizes', () => {
    const stack = new Stack({ direction: 'column', spacing: 0 });
    const a = new Panel({ width: 100, height: 30 });
    const b = new Panel({ width: 80, height: 40 });

    stack.addChild(a, b);
    a.setSize(100, 60);

    expect(b.position.y).toBe(60);
    expect(stack.uiHeight).toBe(100);
  });

  test('re-flows on a direction, spacing or padding change', () => {
    const stack = new Stack({ direction: 'column', spacing: 10 });
    const a = new Panel({ width: 100, height: 30 });
    const b = new Panel({ width: 80, height: 40 });

    stack.addChild(a, b);
    stack.spacing = 0;

    expect(b.position.y).toBe(30);

    stack.padding = 5;

    expect(a.position.y).toBe(5);
    expect(stack.uiWidth).toBe(110);

    stack.direction = 'row';

    expect(b.position.x).toBe(105);
  });

  test('aligns children on the cross axis', () => {
    const stack = new Stack({ direction: 'column', spacing: 0, align: 'center' });
    const a = new Panel({ width: 100, height: 20 });
    const b = new Panel({ width: 40, height: 20 });

    stack.addChild(a, b);

    expect(b.position.x).toBe(30);

    stack.align = 'end';

    expect(b.position.x).toBe(60);

    stack.align = 'start';

    expect(b.position.x).toBe(0);
  });

  test('stretches children across the cross axis', () => {
    const stack = new Stack({ direction: 'column', spacing: 0, align: 'stretch' });
    const a = new Panel({ width: 100, height: 20 });
    const b = new Panel({ width: 40, height: 20 });

    stack.addChild(a, b);

    expect(b.uiWidth).toBe(100);
    expect(stack.uiWidth).toBe(100);
  });

  test('hands leftover main-axis space to growing children', () => {
    const stack = new Stack({ direction: 'column', spacing: 0 });
    const fixed = new Panel({ width: 100, height: 20 });
    const grower = new Panel({ width: 100, height: 20 });

    stack.addChild(fixed, grower);
    stack.setSize(100, 200);
    stack.setGrow(grower, 1);

    expect(grower.uiHeight).toBe(180);
    expect(grower.position.y).toBe(20);
    expect(stack.uiHeight).toBe(200);
  });

  test('splits leftover space by grow factor and ignores it while sizing to content', () => {
    const stack = new Stack({ direction: 'row', spacing: 0 });
    const one = new Panel({ width: 20, height: 10 });
    const two = new Panel({ width: 20, height: 10 });

    stack.addChild(one, two);
    stack.setGrow(one, 1);
    stack.setGrow(two, 3);

    expect(stack.uiWidth).toBe(40);
    expect(one.uiWidth).toBe(20);

    stack.setSize(140, 10);

    expect(one.uiWidth).toBe(45);
    expect(two.uiWidth).toBe(95);
  });

  test('drops a grow factor when it is cleared or its child leaves', () => {
    const stack = new Stack({ direction: 'row', spacing: 0 });
    const child = new Panel({ width: 20, height: 10 });

    stack.addChild(child);
    stack.setSize(100, 10);
    stack.setGrow(child, 1);

    expect(child.uiWidth).toBe(100);

    stack.setGrow(child, 0);

    expect(child.uiWidth).toBe(20);
  });
});

describe('DockContainer', () => {
  test('gives each edge its own band and the rest to the centre', () => {
    const dock = new DockContainer({ width: 400, height: 300 });
    const top = new Panel({ width: 0, height: 40 });
    const left = new Panel({ width: 60, height: 0 });
    const centre = new Panel();

    dock.dock(top, 'top');
    dock.dock(left, 'left');
    dock.dock(centre, 'center');

    expect(top.position.y).toBe(0);
    expect(top.uiWidth).toBe(400);
    expect(left.position.y).toBe(40);
    expect(left.uiHeight).toBe(260);
    expect(centre.position.x).toBe(60);
    expect(centre.position.y).toBe(40);
    expect(centre.uiWidth).toBe(340);
    expect(centre.uiHeight).toBe(260);
  });

  test('docks bottom and right against the far edges', () => {
    const dock = new DockContainer({ width: 200, height: 100 });
    const bottom = new Panel({ width: 0, height: 20 });
    const right = new Panel({ width: 50, height: 0 });

    dock.dock(bottom, 'bottom');
    dock.dock(right, 'right');

    expect(bottom.position.y).toBe(80);
    expect(right.position.x).toBe(150);
    expect(right.uiHeight).toBe(80);
  });

  test('re-flows on resize and when a child leaves', () => {
    const dock = new DockContainer({ width: 200, height: 100 });
    const top = new Panel({ width: 0, height: 20 });
    const centre = new Panel();

    dock.dock(top, 'top');
    dock.dock(centre, 'center');
    dock.setSize(300, 200);

    expect(top.uiWidth).toBe(300);
    expect(centre.uiHeight).toBe(180);

    dock.removeChild(top);

    expect(centre.position.y).toBe(0);
    expect(centre.uiHeight).toBe(200);
  });

  test('treats a child added without a region as the centre', () => {
    const dock = new DockContainer({ width: 120, height: 80 });
    const centre = new Panel();

    dock.addChild(centre);

    expect(centre.uiWidth).toBe(120);
    expect(centre.uiHeight).toBe(80);
  });

  test('reports the region a child is docked in', () => {
    const dock = new DockContainer({ width: 120, height: 80 });
    const side = new Panel({ width: 20, height: 0 });

    dock.dock(side, 'right');

    expect(dock.regionOf(side)).toBe('right');
    expect(dock.regionOf(new Panel())).toBeNull();
  });
});
