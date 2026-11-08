// Chromatic aberration — RGB color channel split
// Subtle version that looks great with neon/purple themes

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = fragCoord / iResolution.xy;
    vec2 center = uv - 0.5;
    float dist = length(center);

    // Offset increases toward edges
    float aberration = 1.5; // pixels of max split
    vec2 offset = center * dist * aberration / iResolution.xy;

    float r = texture(iChannel0, uv + offset).r;
    float g = texture(iChannel0, uv).g;
    float b = texture(iChannel0, uv - offset).b;
    float a = texture(iChannel0, uv).a;

    fragColor = vec4(r, g, b, a);
}
