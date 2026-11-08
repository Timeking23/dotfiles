#version 440
layout(location = 0) in vec2 qt_TexCoord0;
layout(location = 0) out vec4 fragColor;
layout(std140, binding = 0) uniform buf {
    mat4 qt_Matrix;
    float qt_Opacity;
    vec2 res;
    vec2 tex;
    float time;
};
layout(binding = 1) uniform sampler2D src;

float hash(vec2 p) {
    return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
               mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}

float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 5; i++) {
        v += a * noise(p);
        p = p * 2.03 + vec2(1.7, 9.2);
        a *= 0.5;
    }
    return v;
}

void main() {
    vec2 uv = qt_TexCoord0;

    // Cover-fit the image, then let it breathe very slowly.
    float r = (res.x / res.y) / (tex.x / tex.y);
    vec2 s = r > 1.0 ? vec2(1.0, 1.0 / r) : vec2(r, 1.0);
    float zoom = 1.025 + 0.012 * sin(time * 0.06);
    vec2 pan = 0.004 * vec2(sin(time * 0.041), cos(time * 0.033));
    vec2 c = ((uv - 0.5) / zoom) * s + 0.5 + pan;
    vec3 col = texture(src, c).rgb;

    // Two layers of drifting fog, heavier toward the ground.
    float aspect = res.x / res.y;
    vec2 q = vec2(uv.x * aspect, uv.y);
    float f1 = fbm(q * 2.2 + vec2(time * 0.018, time * 0.004));
    float f2 = fbm(q * 4.5 - vec2(time * 0.03, -time * 0.006) + f1);
    float fog = smoothstep(0.35, 0.95, f1 * 0.6 + f2 * 0.55);
    fog *= 0.18 + 0.5 * smoothstep(0.25, 1.0, uv.y);
    col = mix(col, vec3(0.80, 0.79, 0.80), fog * 0.32);

    // Film grain hides the upscale softness.
    float g = hash(uv * res + fract(time * 7.0) * 113.0) - 0.5;
    col += g * 0.045;

    // Vignette.
    vec2 d = uv - 0.5;
    col *= 1.0 - 0.55 * pow(length(d * vec2(1.1, 1.3)), 2.2);

    fragColor = vec4(col, 1.0) * qt_Opacity;
}
