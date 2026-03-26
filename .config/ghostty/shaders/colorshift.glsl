// Color shift — slow hue rotation on saturated colors

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = fragCoord / iResolution.xy;
    vec4 base = texture(iChannel0, uv);

    // RGB to HSV
    float maxC = max(base.r, max(base.g, base.b));
    float minC = min(base.r, min(base.g, base.b));
    float delta = maxC - minC;

    float hue = 0.0;
    if (delta > 0.001) {
        if (maxC == base.r) hue = mod((base.g - base.b) / delta, 6.0);
        else if (maxC == base.g) hue = (base.b - base.r) / delta + 2.0;
        else hue = (base.r - base.g) / delta + 4.0;
        hue /= 6.0;
    }
    float sat = (maxC > 0.001) ? delta / maxC : 0.0;
    float val = maxC;

    // Only shift saturated pixels, leave white/grey text alone
    float shift = iTime * 0.05; // slow drift
    hue = fract(hue + shift * sat);

    // HSV back to RGB
    float h6 = hue * 6.0;
    float f = fract(h6);
    float p = val * (1.0 - sat);
    float q = val * (1.0 - sat * f);
    float t = val * (1.0 - sat * (1.0 - f));

    vec3 rgb;
    int hi = int(mod(h6, 6.0));
    if (hi == 0) rgb = vec3(val, t, p);
    else if (hi == 1) rgb = vec3(q, val, p);
    else if (hi == 2) rgb = vec3(p, val, t);
    else if (hi == 3) rgb = vec3(p, q, val);
    else if (hi == 4) rgb = vec3(t, p, val);
    else rgb = vec3(val, p, q);

    fragColor = vec4(rgb, base.a);
}
