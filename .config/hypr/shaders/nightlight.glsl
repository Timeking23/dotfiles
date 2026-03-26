// Night light shader — reduces blue light
// Adjust temperature and strength to taste

precision mediump float;
varying vec2 v_texcoord;
uniform sampler2D tex;

const float temperature = 4000.0; // Lower = warmer (range: 2500-6500)
const float strength = 1.0;       // 0.0 = off, 1.0 = full effect

// Convert color temperature to RGB multipliers
vec3 temperatureToRGB(float temp) {
    float t = temp / 100.0;
    vec3 color;

    // Red
    if (t <= 66.0)
        color.r = 1.0;
    else
        color.r = clamp(1.292936 * pow(t - 60.0, -0.1332047592), 0.0, 1.0);

    // Green
    if (t <= 66.0)
        color.g = clamp(0.3900815 * log(t) - 0.6318414, 0.0, 1.0);
    else
        color.g = clamp(1.129891 * pow(t - 60.0, -0.0755148492), 0.0, 1.0);

    // Blue
    if (t >= 66.0)
        color.b = 1.0;
    else if (t <= 19.0)
        color.b = 0.0;
    else
        color.b = clamp(0.5432068 * log(t - 10.0) - 1.19625408914, 0.0, 1.0);

    return color;
}

void main() {
    vec4 pixColor = texture2D(tex, v_texcoord);
    vec3 tint = temperatureToRGB(temperature);
    vec3 adjusted = mix(pixColor.rgb, pixColor.rgb * tint, strength);
    gl_FragColor = vec4(adjusted, pixColor.a);
}
