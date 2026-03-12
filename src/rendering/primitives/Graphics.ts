import { Color } from 'core/Color';
import { Container } from 'rendering/Container';
import { bezierCurveTo, clamp, quadraticCurveTo, tau } from 'utils/math';
import { RenderingPrimitives } from 'types/rendering';
import { buildEllipse, buildLine, buildPath, buildPolygon, buildRectangle, buildStar } from 'utils/geometry';
import { Vector } from 'math/Vector';
import { CircleGeometry } from './CircleGeometry';
import { DrawableShape } from './DrawableShape';

export class Graphics extends Container {

    private _lineWidth = 0;
    private _lineColor: Color = new Color();
    private _fillColor: Color = new Color();
    private _currentPoint: Vector = new Vector(0, 0);

    public get lineWidth(): number {
        return this._lineWidth;
    }

    public set lineWidth(lineWidth: number) {
        this._lineWidth = lineWidth;
    }

    public get lineColor(): Color {
        return this._lineColor;
    }

    public set lineColor(lineColor: Color) {
        this._lineColor.copy(lineColor);
    }

    public get fillColor(): Color {
        return this._fillColor;
    }

    public set fillColor(fillColor: Color) {
        this._fillColor.copy(fillColor);
    }

    public get currentPoint(): Vector {
        return this._currentPoint;
    }

    public moveTo(x: number, y: number): this {
        this._currentPoint.set(x, y);

        return this;
    }

    public lineTo(toX: number, toY: number): this {
        const { x: fromX, y: fromY } = this._currentPoint;

        this.drawPath([fromX, fromY, toX, toY]);
        this.moveTo(toX, toY);

        return this;
    }

    public quadraticCurveTo(cpX: number, cpY: number, toX: number, toY: number): this {
        const { x: fromX, y: fromY } = this._currentPoint;

        this.drawPath(quadraticCurveTo(fromX, fromY, cpX, cpY, toX, toY));
        this.moveTo(toX, toY);

        return this;
    }

    public bezierCurveTo(cpX1: number, cpY1: number, cpX2: number, cpY2: number, toX: number, toY: number): this {
        const { x: fromX, y: fromY } = this._currentPoint;

        this.drawPath(bezierCurveTo(fromX, fromY, cpX1, cpY1, cpX2, cpY2, toX, toY));
        this.moveTo(toX, toY);

        return this;
    }

    public arcTo(x1: number, y1: number, x2: number, y2: number, radius: number): this {
        const { x: fromX, y: fromY } = this._currentPoint;
        const r = Math.abs(radius);

        if (r === 0 || (fromX === x1 && fromY === y1) || (x1 === x2 && y1 === y2)) {
            return this.lineTo(x1, y1);
        }

        const inX = x1 - fromX;
        const inY = y1 - fromY;
        const outX = x2 - x1;
        const outY = y2 - y1;
        const inLen = Math.hypot(inX, inY);
        const outLen = Math.hypot(outX, outY);

        if (inLen === 0 || outLen === 0) {
            return this.lineTo(x1, y1);
        }

        const inDirX = inX / inLen;
        const inDirY = inY / inLen;
        const outDirX = outX / outLen;
        const outDirY = outY / outLen;
        const dot = clamp((inDirX * outDirX) + (inDirY * outDirY), -1, 1);
        const angle = Math.acos(dot);

        if (angle === 0 || angle === Math.PI) {
            return this.lineTo(x1, y1);
        }

        const distanceToTangent = r / Math.tan(angle / 2);

        if (!Number.isFinite(distanceToTangent) || distanceToTangent > inLen || distanceToTangent > outLen) {
            return this.lineTo(x1, y1);
        }

        const startX = x1 - (inDirX * distanceToTangent);
        const startY = y1 - (inDirY * distanceToTangent);
        const endX = x1 + (outDirX * distanceToTangent);
        const endY = y1 + (outDirY * distanceToTangent);
        const cross = (inDirX * outDirY) - (inDirY * outDirX);
        const leftTurn = cross > 0;
        const normalX = leftTurn ? -inDirY : inDirY;
        const normalY = leftTurn ? inDirX : -inDirX;
        const centerX = startX + (normalX * r);
        const centerY = startY + (normalY * r);
        const startAngle = Math.atan2(startY - centerY, startX - centerX);
        const endAngle = Math.atan2(endY - centerY, endX - centerX);

        this.lineTo(startX, startY);

        return this.drawArc(centerX, centerY, r, startAngle, endAngle, leftTurn);
    }

    public drawArc(x: number, y: number, radius: number, startAngle: number, endAngle: number, anticlockwise = false): this {
        const r = Math.abs(radius);

        if (r === 0) {
            return this;
        }

        let sweep = endAngle - startAngle;

        if (!anticlockwise && sweep < 0) {
            sweep += tau;
        } else if (anticlockwise && sweep > 0) {
            sweep -= tau;
        }

        if (sweep === 0) {
            return this;
        }

        const segments = Math.max(2, Math.ceil(Math.abs(sweep) / (Math.PI / 16)));
        const path: Array<number> = [];

        for (let i = 0; i <= segments; i++) {
            const ratio = i / segments;
            const angle = startAngle + (sweep * ratio);

            path.push(
                x + (Math.cos(angle) * r),
                y + (Math.sin(angle) * r)
            );
        }

        this.drawPath(path);
        this.moveTo(path[path.length - 2], path[path.length - 1]);

        return this;
    }

    public drawLine(startX: number, startY: number, endX: number, endY: number): this {
        this.addChild(new DrawableShape(buildLine(startX, startY, endX, endY, this._lineWidth), this._lineColor, RenderingPrimitives.TriangleStrip));

        return this;
    }

    public drawPath(path: Array<number>): this {
        this.addChild(new DrawableShape(buildPath(path, this._lineWidth), this._lineColor, RenderingPrimitives.TriangleStrip));

        return this;
    }

    public drawPolygon(path: Array<number>): this {
        const polygon = buildPolygon(path);

        this.addChild(new DrawableShape(polygon, this._fillColor, RenderingPrimitives.TriangleStrip));

        if (this._lineWidth > 0) {
            this.drawPath(polygon.points);
        }

        return this;
    }

    public drawCircle(centerX: number, centerY: number, radius: number): this {
        const circle = new CircleGeometry(centerX, centerY, radius);

        this.addChild(new DrawableShape(circle, this._fillColor, RenderingPrimitives.TriangleStrip));

        if (this._lineWidth > 0) {
            this.drawPath(circle.points);
        }

        return this;
    }

    public drawEllipse(centerX: number, centerY: number, radiusX: number, radiusY: number): this {
        const ellipse = buildEllipse(centerX, centerY, radiusX, radiusY);

        this.addChild(new DrawableShape(ellipse, this._fillColor, RenderingPrimitives.TriangleStrip));

        if (this._lineWidth > 0) {
            this.drawPath(ellipse.points);
        }

        return this;
    }

    public drawRectangle(x: number, y: number, width: number, height: number): this {
        const rectangle = buildRectangle(x, y, width, height);

        this.addChild(new DrawableShape(rectangle, this._fillColor, RenderingPrimitives.TriangleStrip));

        if (this._lineWidth > 0) {
            this.drawPath(rectangle.points);
        }

        return this;
    }

    public drawStar(centerX: number, centerY: number, points: number, radius: number, innerRadius: number = radius / 2, rotation = 0): this {
        const star = buildStar(centerX, centerY, points, radius, innerRadius, rotation);

        this.addChild(new DrawableShape(star, this._fillColor, RenderingPrimitives.TriangleStrip));

        if (this._lineWidth > 0) {
            this.drawPath(star.points);
        }

        return this;
    }

    public clear(): this {
        this.removeChildren();

        this._lineWidth = 0;
        this._lineColor.copy(Color.black);
        this._fillColor.copy(Color.black);
        this._currentPoint.set(0, 0);

        return this;
    }

    public destroy(): void {
        super.destroy();

        this.clear();

        this._lineColor.destroy();
        this._fillColor.destroy();
        this._currentPoint.destroy();
    }
}
