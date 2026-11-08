// Beating Heart — based on iq's classic Shadertoy (XsfGRn)
// A smooth SDF heart that pulses, rendered behind terminal text

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = fragCoord / iResolution.xy;
    vec4 terminal = texture(iChannel0, uv);

    // Centered coordinates
    vec2 p = (20.0 * fragCoord - iResolution.xy) / min(iResolution.x, iResolution.y);
    p.y -= 17;
    p.x -= 29;

    // Heart beat animation
    float beat = pow(0.5 + 0.5 * sin(iTime * 3.14159 * 1.0), 8.0);
    p *= 1.0 - 0.1 * beat;

    // Heart SDF (signed distance field) — iq's formula
    float a = atan(p.x, p.y) / 3.14159;
    float r = length(p);
    float h = abs(a);
    float d = (13.0 * h - 22.0 * h * h + 10.0 * h * h * h) / (6.0 - 5.0 * h);

    // Color the heart
    float heart = smoothstep(d - 0.02, d, r);
    float glow = smoothstep(d + 0.3, d, r);

    // Pink/red heart with soft glow
    vec3 heartColor = mix(vec3(0.9, 0.1, 0.3), vec3(1.0, 0.4, 0.6), glow);
    vec3 glowColor = vec3(0.8, 0.2, 0.4) * glow * 0.15;

    // Inside the heart shape
    vec3 bg = vec3(0.0);
    bg += glowColor; // soft pink glow around heart
    if (heart < 0.5) {
        bg = heartColor * (0.6 + 0.4 * beat); // brighter on beat
    }

    // Blend: terminal text on top, heart behind
    float textPresence = max(terminal.r, max(terminal.g, terminal.b));
    vec3 result = mix(bg * 0.25, terminal.rgb, smoothstep(0.02, 0.1, textPresence));

    fragColor = vec4(result, terminal.a);
}
