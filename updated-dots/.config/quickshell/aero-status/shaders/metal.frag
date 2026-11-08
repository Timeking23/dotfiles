#version 440
layout(location = 0) in vec2 qt_TexCoord0;
layout(location = 0) out vec4 fragColor;
layout(std140, binding = 0) uniform buf {
    mat4 qt_Matrix;
    float qt_Opacity;
    vec2 res;
};

float hash(vec2 p) {
    return fract(sin(dot(p, vec2(41.31, 289.17))) * 43758.5453);
}

float streak(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}

void main() {
    vec2 px = qt_TexCoord0 * res;
    float brush = 0.0;
    brush += streak(px * vec2(0.012, 1.6)) * 0.5;
    brush += streak(px * vec2(0.03, 3.1) + 9.0) * 0.3;
    brush += streak(px * vec2(0.08, 5.3) + 21.0) * 0.2;
    float x = qt_TexCoord0.x;
    float y = qt_TexCoord0.y;
    float spec = 0.50 + 0.26 * exp(-pow((x - 0.28 - y * 0.12) * 4.2, 2.0)) + 0.12 * exp(-pow((x - 0.8 + y * 0.1) * 7.0, 2.0));
    float bevel = smoothstep(0.0, 0.02, x) * 0.5 + 0.5;
    bevel *= 1.0 - 0.45 * smoothstep(0.975, 1.0, x);
    vec3 col = vec3(0.86, 0.885, 0.91) * (spec + (brush - 0.5) * 0.14) * bevel;
    fragColor = vec4(col, 1.0) * qt_Opacity;
}
