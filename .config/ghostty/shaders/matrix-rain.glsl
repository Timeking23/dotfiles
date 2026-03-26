// Matrix rain background for Ghostty
// Falling green characters behind your terminal text

float random(vec2 st) {
    return fract(sin(dot(st, vec2(12.9898, 78.233))) * 43758.5453);
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = fragCoord / iResolution.xy;
    vec4 terminal = texture(iChannel0, uv);

    // Grid for the "characters"
    float columns = 60.0;
    float rows = columns * (iResolution.y / iResolution.x);
    vec2 grid = vec2(columns, rows);
    vec2 cell = floor(uv * grid);

    // Each column falls at a different speed/offset
    float speed = 1.0 + random(vec2(cell.x, 0.0)) * 2.0;
    float offset = random(vec2(cell.x, 1.0)) * 100.0;
    float drop = fract((iTime * speed + offset) / grid.y);

    // Cell position in the falling column
    float cellY = fract(uv.y * grid.y);
    float head = 1.0 - drop;

    // Distance from the "head" of each rain drop
    float dist = mod(uv.y - head + 1.0, 1.0);
    float trail = smoothstep(0.0, 0.6, 1.0 - dist);

    // Random character flicker
    float flicker = step(0.5, random(cell + floor(iTime * 8.0)));

    // Green rain color
    vec3 rain = vec3(0.0, 0.8, 0.2) * trail * 0.15 * flicker;

    // Blend: terminal on top, rain behind
    float textPresence = max(terminal.r, max(terminal.g, terminal.b));
    vec3 result = mix(rain, terminal.rgb, smoothstep(0.02, 0.1, textPresence));

    fragColor = vec4(result, terminal.a);
}
