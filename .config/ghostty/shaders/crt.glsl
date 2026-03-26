// CRT shader for Ghostty — scanlines, barrel distortion, vignette
// Looks like an old-school CRT monitor

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = fragCoord / iResolution.xy;

    // Barrel distortion (CRT curvature)
    vec2 center = uv - 0.5;
    float dist = dot(center, center);
    float barrel = 0.15; // curvature amount
    uv = uv + center * dist * barrel;

    // Discard pixels outside the curved screen
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
        fragColor = vec4(0.0, 0.0, 0.0, 1.0);
        return;
    }

    vec4 color = texture(iChannel0, uv);

    // Scanlines
    float scanline = sin(fragCoord.y * 3.14159 * 0.8) * 0.04;
    color.rgb -= scanline;

    // Vignette (darker edges)
    float vignette = 1.0 - dist * 1.8;
    color.rgb *= vignette;

    // Slight green phosphor tint (optional — remove these 2 lines for neutral)
    // color.g *= 1.05;
    // color.rb *= vec2(0.95);

    fragColor = color;
}
