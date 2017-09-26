precision lowp float;

attribute vec2 aVertexPosition;
attribute vec2 aTextureCoord;
attribute vec2 aPosition;
attribute vec2 aScale;
attribute float aRotation;
attribute vec4 aColor;

uniform mat3 projectionMatrix;

varying vec2 vTextureCoord;
varying vec4 vColor;

void main(void) {
    vTextureCoord = aTextureCoord;
    vColor = vec4(aColor.rgb * aColor.a, aColor.a);

    vec2 pos = vec2(
        (aVertexPosition.x * cos(aRotation)) - (aVertexPosition.y * sin(aRotation)),
        (aVertexPosition.x * sin(aRotation)) + (aVertexPosition.y * cos(aRotation))
    );

    gl_Position = vec4((projectionMatrix * vec3((pos * aScale) + aPosition, 1.0)).xy, 0.0, 1.0);
}
