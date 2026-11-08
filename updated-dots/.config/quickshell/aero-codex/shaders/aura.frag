#version 440
layout(location = 0) in vec2 qt_TexCoord0;
layout(location = 0) out vec4 fragColor;
layout(std140, binding = 0) uniform buf {
    mat4 qt_Matrix;
    float qt_Opacity;
    float time;
    vec4 accent;
};

void main() {
    vec2 p = qt_TexCoord0 - vec2(0.5, 0.54);
    p.x *= 1.15;
    float r = length(p);
    float a = atan(p.y, p.x);
    float rays = 0.5 + 0.5 * sin(a * 9.0 + time * 0.5) * sin(a * 5.0 - time * 0.33);
    float ring = exp(-pow((r - 0.30 - 0.012 * sin(time * 1.2)) * 26.0, 2.0));
    float rune = smoothstep(0.75, 1.0, sin(a * 24.0 + time * 0.3)) * exp(-pow((r - 0.42) * 42.0, 2.0));
    float glow = exp(-r * 3.4);
    vec3 col = accent.rgb * (glow * (0.45 + 0.75 * rays) + ring * 0.8 + rune * 0.7);
    col += vec3(1.0) * exp(-r * r * 40.0) * 0.14;
    fragColor = vec4(col, 1.0) * qt_Opacity;
}
