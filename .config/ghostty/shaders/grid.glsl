// Grid overlay — faint holographic pixel grid

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = fragCoord / iResolution.xy;
    vec4 base = texture(iChannel0, uv);

    // Grid lines
    float cellSize = 24.0;
    vec2 grid = abs(fract(fragCoord / cellSize) - 0.5);
    float line = min(grid.x, grid.y);
    float gridMask = 1.0 - smoothstep(0.0, 0.04, line);

    // Faint cyan tint
    vec3 gridColor = vec3(0.3, 0.7, 0.9) * gridMask * 0.07;

    fragColor = vec4(base.rgb + gridColor, base.a);
}
