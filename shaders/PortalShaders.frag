// Fragment Shader
uniform float iTime;
uniform vec4 resolution;
uniform vec3 portalColor;

in vec2 vUv; // Input texture coordinates from the vertex shader

// Simple Perlin noise implementation
float snoise(vec3 uv, float res)
{
    const vec3 s = vec3(1e0, 1e2, 1e3);
    uv *= res;
    vec3 uv0 = floor(mod(uv, res)) * s;
    vec3 uv1 = floor(mod(uv + vec3(1.), res)) * s;
    vec3 f = fract(uv); f = f * f * (3.0 - 2.0 * f);
    vec4 v = vec4(uv0.x + uv0.y + uv0.z, uv1.x + uv0.y + uv0.z,
                    uv0.x + uv1.y + uv0.z, uv1.x + uv1.y + uv0.z);
    vec4 r = fract(sin(v * 1e-1) * 1e3);
    float r0 = mix(mix(r.x, r.y, f.x), mix(r.z, r.w, f.x), f.y);
    r = fract(sin((v + uv1.z - uv0.z) * 1e-1) * 1e3);
    float r1 = mix(mix(r.x, r.y, f.x), mix(r.z, r.w, f.x), f.y);
    return mix(r0, r1, f.z) * 2. - 1.;
}

void main() {
    vec2 p = -0.42 + 0.84 * vUv;

    // Add rotation to the angle
    float rotationSpeed = 0.3; // Adjust rotation speed here
    float angle = atan(p.y, p.x) + iTime * rotationSpeed; // Rotate based on time

    // Use the rotated angle for the x-coordinate in the coord
    vec3 coord = vec3(
        angle / 6.2832 + 0.5, // Proper angular coordinate (now rotates over time)
        length(p) * 0.4 + iTime * 0.2, // Outward flow
        0.5 + sin(iTime * 0.5) * 0.1 // Pulsating depth
    );

    coord = 1.0 - coord;

    // Add Perlin noise to create dynamic movement
    float color = 3.0 - (3.0 * length(2.0 * p));
    for (int i = 1; i <= 2; i++) {
        float power = pow(2.0, float(i));
        color += (0.4 / power) * snoise(coord, power * 16.0); // Using the animated coord directly
    }

    color = 1.0 - color;
    color *= 2.7;
    color *= smoothstep(0.43, 0.4, length(p));

    // Create a smooth background transition
    float pct = distance(vUv, vec2(0.5));
    float y = smoothstep(0.16, 0.525, pct);

    // Output the final color with the portal color and background blending
    gl_FragColor = vec4(mix(vec3(1.0), portalColor, color), y);
}
