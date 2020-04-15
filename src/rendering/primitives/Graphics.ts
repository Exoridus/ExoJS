import { Color } from '../../core/Color';
import { Container } from '../Container';
import { bezierCurveTo, quadraticCurveTo } from '../../utils/math';
import { RenderingPrimitives } from '../../const/rendering';
import { buildEllipse, buildLine, buildPath, buildPolygon, buildRectangle, buildStar } from '../../utils/geometry';
import { Vector } from '../../math/Vector';
import { CircleGeometry } from './CircleGeometry';
import { DrawableShape } from "./DrawableShape";

export class Graphics extends Container {

    private _lineWidth = 0;
    private _lineColor: Color = new Color();
    private _fillColor: Color = new Color();
    private _currentPoint: Vector = new Vector(0, 0);

    get lineWidth() {
        return this._lineWidth;
    }

    set lineWidth(lineWidth) {
        this._lineWidth = lineWidth;
    }

    get lineColor() {
        return this._lineColor;
    }

    set lineColor(lineColor) {
        this._lineColor.copy(lineColor);
    }

    get fillColor() {
        return this._fillColor;
    }

    set fillColor(fillColor) {
        this._fillColor.copy(fillColor);
    }

    get currentPoint() {
        return this._currentPoint;
    }

    moveTo(x: number, y: number): this {
        this._currentPoint.set(x, y);

        return this;
    }

    lineTo(toX: number, toY: number): this {
        const { x: fromX, y: fromY } = this._currentPoint;

        this.drawPath([fromX, fromY, toX, toY]);
        this.moveTo(toX, toY);

        return this;
    }

    quadraticCurveTo(cpX: number, cpY: number, toX: number, toY: number): this {
        const { x: fromX, y: fromY } = this._currentPoint;

        this.drawPath(quadraticCurveTo(fromX, fromY, cpX, cpY, toX, toY));
        this.moveTo(toX, toY);

        return this;
    }

    bezierCurveTo(cpX1: number, cpY1: number, cpX2: number, cpY2: number, toX: number, toY: number): this {
        const { x: fromX, y: fromY } = this._currentPoint;

        this.drawPath(bezierCurveTo(fromX, fromY, cpX1, cpY1, cpX2, cpY2, toX, toY));
        this.moveTo(toX, toY);

        return this;
    }

    arcTo(x1: number, y1: number, x2: number, y2: number, radius: number): this {
        return this; // todo
    }

    drawArc(x: number, y: number, radius: number, startAngle: number, endAngle: number, anticlockwise = false): this {
        return this; // todo
    }

    drawLine(startX: number, startY: number, endX: number, endY: number): this {
        this.addChild(new DrawableShape(buildLine(startX, startY, endX, endY, this._lineWidth), this._lineColor, RenderingPrimitives.TRIANGLE_STRIP));

        return this;
    }

    drawPath(path: Array<number>): this {
        this.addChild(new DrawableShape(buildPath(path, this._lineWidth), this._lineColor, RenderingPrimitives.TRIANGLE_STRIP));

        return this;
    }

    drawPolygon(path: Array<number>): this {
        const polygon = buildPolygon(path);

        this.addChild(new DrawableShape(polygon, this._fillColor, RenderingPrimitives.TRIANGLE_STRIP));

        if (this._lineWidth > 0) {
            this.drawPath(polygon.points);
        }

        return this;
    }

    drawCircle(centerX: number, centerY: number, radius: number): this {
        const circle = new CircleGeometry(centerX, centerY, radius);

        this.addChild(new DrawableShape(circle, this._fillColor, RenderingPrimitives.TRIANGLE_STRIP));

        if (this._lineWidth > 0) {
            this.drawPath(circle.points);
        }

        return this;
    }

    drawEllipse(centerX: number, centerY: number, radiusX: number, radiusY: number): this {
        const ellipse = buildEllipse(centerX, centerY, radiusX, radiusY);

        this.addChild(new DrawableShape(ellipse, this._fillColor, RenderingPrimitives.TRIANGLE_STRIP));

        if (this._lineWidth > 0) {
            this.drawPath(ellipse.points);
        }

        return this;
    }

    drawRectangle(x: number, y: number, width: number, height: number): this {
        const rectangle = buildRectangle(x, y, width, height);

        this.addChild(new DrawableShape(rectangle, this._fillColor, RenderingPrimitives.TRIANGLE_STRIP));

        if (this._lineWidth > 0) {
            this.drawPath(rectangle.points);
        }

        return this;
    }

    drawStar(centerX: number, centerY: number, points: number, radius: number, innerRadius: number = radius / 2, rotation = 0): this {
        const star = buildStar(centerX, centerY, points, radius, innerRadius, rotation);

        this.addChild(new DrawableShape(star, this._fillColor, RenderingPrimitives.TRIANGLE_STRIP));

        if (this._lineWidth > 0) {
            this.drawPath(star.points);
        }

        return this;
    }

    clear(): this {
        this.removeChildren();

        this._lineWidth = 0;
        this._lineColor.copy(Color.Black);
        this._fillColor.copy(Color.Black);
        this._currentPoint.set(0, 0);

        return this;
    }

    destroy(): void {
        super.destroy();

        this.clear();

        this._lineColor.destroy();
        this._fillColor.destroy();
        this._currentPoint.destroy();
    }
}
