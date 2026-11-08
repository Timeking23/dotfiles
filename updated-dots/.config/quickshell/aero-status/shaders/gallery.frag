#version 440
layout(location = 0) in vec2 qt_TexCoord0;
layout(location = 0) out vec4 fragColor;
layout(std140, binding = 0) uniform buf {
    mat4 qt_Matrix;
    float qt_Opacity;
    vec2 res;
    vec2 srcSize;
    vec2 dstSize;
    float time;
    float progress;
    float dir;
    float hud;
    vec4 p0;
    vec4 p1;
    vec4 p2;
    vec4 p3;
    vec4 p4;
    vec4 p5;
    vec4 p6;
};
layout(binding = 1) uniform sampler2D srcTex;
layout(binding = 2) uniform sampler2D dstTex;

const float PI = 3.14159265;
const vec3 CYAN = vec3(0.25, 0.85, 0.92);

float hash(vec2 p) {
    return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

vec2 cover(vec2 uv, vec2 tex, float phase) {
    float zoom = 1.05 + 0.035 * sin(time * 0.05 + phase);
    vec2 pan = 0.012 * vec2(sin(time * 0.037 + phase), cos(time * 0.029 + phase));
    float r = (res.x / res.y) / (max(tex.x, 1.0) / max(tex.y, 1.0));
    vec2 s = r > 1.0 ? vec2(1.0, 1.0 / r) : vec2(r, 1.0);
    vec2 o = r > 1.0 ? vec2(0.0, (1.0 - s.y) * 0.3) : vec2((1.0 - s.x) * 0.5, 0.0);
    vec2 c = (uv - 0.5) / zoom + 0.5 + pan;
    return o + c * s;
}

vec3 sharp(sampler2D t, vec2 tex, vec2 uv, float phase) {
    vec2 d = (uv - 0.5) * dot(uv - 0.5, uv - 0.5) * 0.012;
    return vec3(texture(t, cover(uv + d, tex, phase)).r,
                texture(t, cover(uv, tex, phase)).g,
                texture(t, cover(uv - d, tex, phase)).b);
}

vec3 frosted(sampler2D t, vec2 tex, vec2 uv, float phase) {
    vec3 c = vec3(0.0);
    vec2 px = 26.0 / res;
    for (int i = 0; i < 8; i++) {
        float a = float(i) * PI / 4.0;
        c += textureLod(t, cover(uv + px * vec2(cos(a), sin(a)), tex, phase), 4.0).rgb;
    }
    return c / 8.0;
}

float box(vec2 p, vec4 r, float radius) {
    vec2 q = abs(p - r.xy - r.zw * 0.5) - r.zw * 0.5 + radius;
    return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - radius;
}

float panels(vec2 p) {
    float d = 1e5;
    if (p0.z > 0.0) d = min(d, box(p, p0, 3.0));
    if (p1.z > 0.0) d = min(d, box(p, p1, 3.0));
    if (p2.z > 0.0) d = min(d, box(p, p2, 3.0));
    if (p3.z > 0.0) d = min(d, box(p, p3, 3.0));
    if (p4.z > 0.0) d = min(d, box(p, p4, 3.0));
    if (p5.z > 0.0) d = min(d, box(p, p5, 3.0));
    if (p6.z > 0.0) d = min(d, box(p, p6, 3.0));
    return d;
}

void main() {
    vec2 uv = qt_TexCoord0;
    vec2 px = uv * res;
    float p = progress;
    float g = sin(p * PI);

    float band = floor(px.y / 24.0);
    float shift = (hash(vec2(band, floor(time * 24.0))) - 0.5) * 0.10 * g * g;
    vec2 ua = uv + vec2(shift + dir * p * 0.05, 0.0);
    vec2 ub = uv + vec2(shift - dir * (1.0 - p) * 0.05, 0.0);

    float wipe = dir > 0.0 ? 1.0 - uv.x : uv.x;
    float n = hash(floor(px / 48.0));
    float t = p * 1.7 - wipe * 0.7 - n * 0.3;
    float m = p >= 1.0 ? 1.0 : smoothstep(0.0, 0.06, t);

    vec3 col = sharp(srcTex, srcSize, ua, 0.0);
    if (m > 0.0) col = mix(col, sharp(dstTex, dstSize, ub, 1.7), m);
    col += CYAN * (1.0 - abs(2.0 * m - 1.0)) * g * 0.75;
    col = mix(col, col * col * (3.0 - 2.0 * col), 0.22);

    float y = uv.y;
    float top = (1.0 - smoothstep(0.0, 0.11, y)) * 0.55;
    float low = smoothstep(0.445, 0.525, y) * 0.34;
    col *= 1.0 - hud * max(top, low);

    float beam = fract(time / 11.0) * 1.3 - 0.15;
    float glow = exp(-pow((y - beam) * 14.0, 2.0));
    vec2 cell = abs(fract(px / 24.0 + 0.5) - 0.5) * 24.0;
    float line = 1.0 - smoothstep(0.0, 1.1, min(cell.x, cell.y));
    col += CYAN * line * (0.035 + 0.16 * glow) * hud;
    col += CYAN * 0.022 * glow * hud;

    float sd = panels(px);
    if (hud > 0.0 && sd < 90.0) {
        col *= 1.0 - hud * 0.5 * exp(-max(sd, 0.0) * 0.085) * step(0.0, sd);
        float f = 1.0 - smoothstep(-0.5, 0.5, sd);
        if (f > 0.0) {
            vec3 ice = frosted(srcTex, srcSize, ua, 0.0);
            if (m > 0.0) ice = mix(ice, frosted(dstTex, dstSize, ub, 1.7), m);
            ice = ice * vec3(0.30, 0.42, 0.48) + vec3(0.008, 0.042, 0.066);
            ice += (hash(px * 0.73) - 0.5) * 0.012;
            col = mix(col, ice, f * hud);
        }
        float rim = exp(-abs(sd) * 0.9) * (0.40 + 0.5 * glow);
        col += CYAN * rim * hud;
        col += vec3(1.0) * 0.07 * (1.0 - smoothstep(0.0, 26.0, -sd)) * f * hud * smoothstep(-1.0, 1.0, dFdy(sd));
    }

    vec2 v = uv * (1.0 - uv);
    col *= mix(1.0, pow(clamp(16.0 * v.x * v.y, 0.0, 1.0), 0.28), 0.55 + 0.25 * hud);
    col *= 1.0 - 0.045 * hud * (0.5 + 0.5 * sin(gl_FragCoord.y * PI * 0.5));
    col += (hash(uv * 311.0 + fract(time)) - 0.5) * 0.016;
    fragColor = vec4(col, 1.0) * qt_Opacity;
}
