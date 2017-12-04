precision lowp float;

attribute vec2 vertexPosition;
attribute vec2 textureCoord;
attribute vec4 tint;

uniform mat3 projectionMatrix;

varying vec2 vTextureCoord;
varying vec4 vTint;

void main(void) {
    vTextureCoord = textureCoord;
    vTint = vec4(tint.rgb * tint.a, tint.a);

    gl_Position = vec4((projectionMatrix * vec3(vertexPosition, 1.0)).xy, 0.0, 1.0);
}
