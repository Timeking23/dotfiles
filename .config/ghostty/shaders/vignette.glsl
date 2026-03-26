// Vignette — darkens edges for a focused, moody look

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = fragCoord / iResolution.xy;
    vec4 base = texture(iChannel0, uv);

    vec2 center = uv - 0.5;
    float dist = length(center);
    float vignette = smoothstep(0.9, 0.5, dist);

    fragColor = vec4(base.rgb * vignette, base.a);
}
