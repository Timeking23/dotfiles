// Glitch effect — periodic horizontal tears and color shifts
// Subtle enough to be usable, cool enough to look hacker-y

float rand(float s) {
    return fract(sin(s * 12.9898) * 43758.5453);
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = fragCoord / iResolution.xy;

    // Time-based glitch trigger (glitches for ~0.1s every ~3s)
    float glitchTime = floor(iTime * 0.33);
    float glitchPhase = fract(iTime * 0.33);
    float glitchOn = step(0.92, glitchPhase); // active ~8% of the time

    vec2 offset = vec2(0.0);

    if (glitchOn > 0.5) {
        // Horizontal tear — different bands shift differently
        float band = floor(uv.y * 20.0);
        float shift = (rand(band + glitchTime) - 0.5) * 0.03;
        offset.x = shift;
    }

    vec4 color = texture(iChannel0, uv + offset);

    // During glitch, add slight RGB split
    if (glitchOn > 0.5) {
        float r = texture(iChannel0, uv + offset + vec2(0.005, 0.0)).r;
        float b = texture(iChannel0, uv + offset - vec2(0.005, 0.0)).b;
        color.r = r;
        color.b = b;
    }

    fragColor = color;
}
