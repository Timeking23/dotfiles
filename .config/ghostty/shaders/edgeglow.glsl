// Edge glow — terminal borders pulse with neon color

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = fragCoord / iResolution.xy;
    vec4 base = texture(iChannel0, uv);

    // Distance from nearest edge
    vec2 edge = min(uv, 1 - uv);
    float d = min(edge.x, edge.y);

    // Pulsing glow
    float pulse = 0.5 + 0.5 * sin(iTime * 1.5);
    float glow = smoothstep(0.01, 0.0, d) * (0.3 + 0.2 * pulse);

    // Neon purple/pink edge color
    vec3 glowColor = mix(vec3(0.6, 0.1, 0.9), vec3(0.9, 0.2, 0.6), pulse);

    fragColor = vec4(base.rgb + glowColor * glow, base.a);
}
