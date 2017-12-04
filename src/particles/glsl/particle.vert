precision lowp float;

attribute vec2 vertexPosition;
attribute vec2 textureCoord;
attribute vec2 translation;
attribute vec2 scale;
attribute float rotation;
attribute vec4 tint;

uniform mat3 projectionMatrix;

varying vec2 vTextureCoord;
varying vec4 vTint;

void main(void) {
    vTextureCoord = textureCoord;
    vTint = vec4(tint.rgb * tint.a, tint.a);

    vec2 pos = vec2(
        (vertexPosition.x * cos(rotation)) - (vertexPosition.y * sin(rotation)),
        (vertexPosition.x * sin(rotation)) + (vertexPosition.y * cos(rotation))
    );

    gl_Position = vec4((projectionMatrix * vec3((pos * scale) + translation, 1.0)).xy, 0.0, 1.0);
}
