#version 440
layout(location = 0) in vec2 qt_TexCoord0;
layout(location = 0) out vec4 fragColor;
layout(std140, binding = 0) uniform buf {
    mat4 qt_Matrix;
    float qt_Opacity;
    vec2 res;
    float time;
    vec4 accent;
};

float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}

float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 4; i++) {
        v += a * noise(p);
        p = p * 2.03 + vec2(13.1, 7.7);
        a *= 0.5;
    }
    return v;
}

void main() {
    vec2 uv = qt_TexCoord0;
    vec2 p = uv * vec2(res.x / res.y, 1.0) * 3.2;
    float t = time * 0.025;
    vec2 w = vec2(fbm(p + t), fbm(p + vec2(5.2, 1.3) - t));
    float n = fbm(p + 2.6 * w);
    float vein = pow(1.0 - abs(2.0 * fbm(p * 0.7 + 3.0 * w) - 1.0), 14.0);
    vec3 col = mix(vec3(0.030, 0.024, 0.085), vec3(0.20, 0.13, 0.40), smoothstep(0.25, 0.8, n));
    col = mix(col, accent.rgb * 0.55, smoothstep(0.55, 0.85, w.x) * 0.35);
    col += vec3(0.85, 0.68, 0.34) * vein * 0.42;

    vec2 cell = floor(uv * res / 3.5);
    float star = step(0.9965, hash(cell));
    col += vec3(0.75, 0.72, 1.0) * star * (0.35 + 0.65 * sin(time * 1.6 + hash(cell + 3.0) * 6.28) * 0.5 + 0.3);

    vec2 v = uv * (1.0 - uv);
    col *= mix(0.32, 1.0, pow(clamp(18.0 * v.x * v.y, 0.0, 1.0), 0.4));
    fragColor = vec4(col, 1.0) * qt_Opacity;
}
