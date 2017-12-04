precision lowp float;

uniform sampler2D texture;

varying vec2 vTextureCoord;
varying vec4 vTint;

void main(void) {
    gl_FragColor = texture2D(texture, vTextureCoord) * vTint;
}
