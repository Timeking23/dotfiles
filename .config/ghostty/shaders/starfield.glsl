// Starfield — flying through space behind your terminal

float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = fragCoord / iResolution.xy;
    vec4 terminal = texture(iChannel0, uv);

    vec3 stars = vec3(0.0);

    // Multiple star layers for parallax depth
    for (int layer = 0; layer < 3; layer++) {
        float depth = 1.0 + float(layer) * 0.5;
        float speed = 0.05 / depth;
        float scale = 80.0 + float(layer) * 40.0;

        vec2 st = uv * scale;
        st.y += iTime * speed * scale;

        vec2 cell = floor(st);
        vec2 f = fract(st);

        float h = hash(cell + float(layer) * 100.0);
        vec2 starPos = vec2(h, fract(h * 127.1));
        float d = length(f - starPos);

        float brightness = h * 0.8 + 0.2;
        float size = 0.02 + h * 0.03;
        float star = smoothstep(size, 0.0, d) * brightness / depth;

        // Twinkle
        star *= 0.7 + 0.3 * sin(iTime * (2.0 + h * 4.0) + h * 6.28);

        stars += star * vec3(0.7 + h * 0.3, 0.7 + fract(h * 13.0) * 0.3, 1.0);
    }

    // Blend: terminal on top, stars behind
    float textPresence = max(terminal.r, max(terminal.g, terminal.b));
    vec3 result = mix(stars * 0.3, terminal.rgb, smoothstep(0.02, 0.1, textPresence));

    fragColor = vec4(result, terminal.a);
}
