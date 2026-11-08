// Neon Purple Bloom shader for Ghostty
// Glows purple/saturated colors, leaves white/grey text alone

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = fragCoord / iResolution.xy;
    vec4 base = texture(iChannel0, uv);

    float bloom_radius = 1.0;
    float bloom_intensity = 0.5;
    int samples = 5;
    vec4 glow = vec4(0.0);

    for (int x = -samples; x <= samples; x++) {
        for (int y = -samples; y <= samples; y++) {
            vec2 offset = vec2(float(x), float(y)) * bloom_radius / iResolution.xy;
            vec4 s = texture(iChannel0, uv + offset);

            // Measure how "colorful" (saturated) the pixel is
            // White/grey has low saturation, neon purple has high saturation
            float maxC = max(s.r, max(s.g, s.b));
            float minC = min(s.r, min(s.g, s.b));
            float saturation = (maxC > 0.01) ? (maxC - minC) / maxC : 0.0;

            // Only glow saturated (purple/neon) pixels, skip white/grey
            float weight = smoothstep(0.2, 0.6, saturation);
            glow += s * weight;
        }
    }

    float total_samples = float((2 * samples + 1) * (2 * samples + 1));
    glow /= total_samples;

    fragColor = base + glow * bloom_intensity;
    fragColor.a = base.a;
}
