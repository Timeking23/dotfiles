#version 440
layout(location = 0) in vec2 qt_TexCoord0;
layout(location = 0) out vec4 fragColor;
layout(std140, binding = 0) uniform buf {
    mat4 qt_Matrix;
    float qt_Opacity;
};
layout(binding = 1) uniform sampler2D source;

void main() {
    vec4 c = texture(source, qt_TexCoord0);
    float l = dot(c.rgb, vec3(0.299, 0.587, 0.114));
    // Pull album art toward the wallpaper's grey, keep a hint of colour.
    vec3 m = mix(vec3(l), c.rgb, 0.45) * 0.92;
    fragColor = vec4(m, c.a) * qt_Opacity;
}
