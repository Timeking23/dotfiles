// Bloom / neon glow shader for Hyprland
// Brightens highlights and adds a soft glow halo to bright areas

precision mediump float;
varying vec2 v_texcoord;
uniform sampler2D tex;

// Tune these to taste
const float bloom_strength = 0.30;   // How bright the bloom is (0.0–1.0)
const float bloom_threshold = 0.55;  // Pixels brighter than this bloom
const float bloom_spread = 0.004;    // Blur radius for the bloom halo

// Simple 9-tap box blur bloom extraction
vec3 bloomSample(sampler2D t, vec2 uv, float spread) {
    vec3 acc = vec3(0.0);
    float w = 0.0;
    for (int x = -2; x <= 2; x++) {
        for (int y = -2; y <= 2; y++) {
            vec2 offset = vec2(float(x), float(y)) * spread;
            vec3 s = texture2D(t, uv + offset).rgb;
            // Only accumulate bright pixels (above threshold)
            float luma = dot(s, vec3(0.2126, 0.7152, 0.0722));
            float weight = max(0.0, luma - bloom_threshold);
            acc += s * weight;
            w += weight;
        }
    }
    return w > 0.0 ? acc / w : vec3(0.0);
}

void main() {
    vec4 base = texture2D(tex, v_texcoord);

    // Compute bloom contribution
    vec3 bloom = bloomSample(tex, v_texcoord, bloom_spread);

    // Tint bloom toward cyan (#00e5ff) to match the neon AGS palette
    vec3 neonTint = vec3(0.0, 0.898, 1.0);
    bloom = mix(bloom, bloom * neonTint * 1.4, 0.35);

    // Additive blend — brightens highlights only
    vec3 result = base.rgb + bloom * bloom_strength;

    gl_FragColor = vec4(result, base.a);
}
