/**
 * GLSL for the welcome scene: a blurred dusk over a mountain ridge, like a grainy night photo
 * taken from a moving car. The palette lives here because it is painted, not UI chrome.
 */

export const DUSK_VERTEX = `
attribute vec2 aPosition;
void main() {
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

export const DUSK_FRAGMENT = `
precision highp float;

uniform vec2 uRes;
uniform float uTime;
/** Pointer, -1..1 on each axis, for a little parallax. */
uniform vec2 uPointer;
/** Smear bands behind glyph clusters: x0, y0, x1, y1 in 0..1, y up; unused ones are zero. */
uniform vec4 uSmear[6];

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

/** A well-spread hash for per-pixel grain (Dave Hoskins' hash12), free of visible patterns. */
float grainHash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * noise(p);
    p *= 2.03;
    a *= 0.5;
  }
  return v;
}

/** A soft, out-of-focus light: a bright core and a wide halo. */
vec3 bokeh(vec2 uv, vec2 pos, vec2 size, vec3 color) {
  vec2 d = (uv - pos) / size;
  float r = dot(d, d);
  return color * (exp(-r * 2.2) * 0.9 + exp(-r * 0.3) * 0.16);
}

vec3 scene(vec2 uv) {
  float t = uTime;
  vec2 par = uPointer * 0.015;

  // Sky: deep blue overhead, dusty blue and a violet haze towards the horizon.
  vec3 col = mix(vec3(0.30, 0.44, 0.70), vec3(0.06, 0.15, 0.33), smoothstep(0.35, 1.05, uv.y));
  col = mix(col, vec3(0.58, 0.52, 0.78), smoothstep(0.58, 0.3, uv.y) * 0.6);
  col *= 0.85 + 0.3 * fbm(uv * vec2(1.6, 3.2) + vec2(t * 0.012, t * 0.004));

  // A warm light leak sweeping across the sky.
  float x = uv.x - par.x * 2.0;
  float bandY = 0.62 + (x - 0.75) * 0.55 + 0.025 * sin(t * 0.17);
  float band = exp(-pow((uv.y - bandY) * 7.0, 2.0)) * smoothstep(0.25, 0.95, x);
  col = mix(col, vec3(0.86, 0.45, 0.55), band * 0.45);
  col += vec3(1.0, 0.55, 0.28) * pow(band, 2.5) * 0.55 * (0.8 + 0.2 * sin(t * 0.5));
  col += vec3(0.75, 1.0, 0.85) * pow(band, 7.0) * 0.35 * smoothstep(0.6, 0.95, x);

  // Two red planets low in the sky.
  col += bokeh(uv, vec2(0.18, 0.86) + par, vec2(0.012, 0.016), vec3(1.0, 0.38, 0.32));
  col += bokeh(uv, vec2(0.27, 0.77) + par * 1.2, vec2(0.014, 0.018), vec3(1.0, 0.45, 0.35));

  // A soft, out-of-focus mountain ridge.
  float ridge = 0.33 + 0.16 * fbm(vec2((uv.x + par.x) * 2.1 + 3.0, 0.7)) - 0.06 * uv.x;
  float hill = smoothstep(ridge + 0.035, ridge - 0.045, uv.y);
  vec3 ground = mix(vec3(0.05, 0.03, 0.09), vec3(0.01, 0.01, 0.03), smoothstep(0.3, 0.0, uv.y));
  col = mix(col, ground, hill);

  // Road and window lights below the ridge, drifting past.
  for (int i = 0; i < 9; i++) {
    float fi = float(i);
    float h1 = hash(vec2(fi, 1.3));
    float h2 = hash(vec2(fi, 7.1));
    float h3 = hash(vec2(fi, 3.9));
    vec2 pos = vec2(fract(h1 + t * (0.004 + h3 * 0.01)), 0.05 + h2 * 0.22) + par * (1.5 + h3);
    vec3 c = h3 > 0.66 ? vec3(0.45, 0.95, 0.85) : (h3 > 0.33 ? vec3(1.0, 0.85, 0.6) : vec3(1.0, 0.45, 0.18));
    float flicker = 0.75 + 0.25 * sin(t * (0.6 + h1) + fi);
    col += bokeh(uv, pos, vec2(0.05 + h2 * 0.04, 0.018 + h1 * 0.012), c) * flicker * 0.9;
  }
  return col;
}

void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  float t = uTime;

  // Pixel-sort glitches: in some blocks every thin column takes its colour from one row of the
  // image above it and smears it down, so the scene streaks; whole bands also slide sideways.
  vec2 grid = vec2(6.0, 22.0);
  vec2 blk = floor(uv * grid);
  float slot = floor(t * 1.4);
  float cell = step(0.95, hash(blk + vec2(slot * 7.13, slot * 1.7)));
  float band = step(0.975, hash(vec2(blk.y, slot + 3.0)))
    * step(blk.x, 1.0 + floor(hash(vec2(slot, blk.y)) * 4.0));
  float active = clamp(cell + band, 0.0, 1.0);
  vec2 suv = uv;
  float streak = 1.0;
  float smearTop = -1.0;
  for (int i = 0; i < 6; i++) {
    vec4 r = uSmear[i];
    if (uv.x >= r.x && uv.x <= r.z && uv.y >= r.y && uv.y <= r.w) smearTop = r.w;
  }
  if (smearTop >= 0.0) {
    // Behind a glyph cluster: like pixel sorting, each thin column drags a colour along, pulled
    // towards the bright light leak, so the band streaks in warm and cool stripes.
    float column = floor(gl_FragCoord.x / 2.0);
    float pick = hash(vec2(column, floor(smearTop * 100.0)));
    float pull = hash(vec2(column * 0.37, smearTop * 31.0));
    suv = vec2(mix(uv.x, 0.82, pull * 0.7), mix(smearTop + 0.02, 0.62, pull * 0.8) + pick * 0.06);
    streak = 0.55 + 1.05 * pick;
    active = 1.0;
  } else if (active > 0.5) {
    float column = floor(gl_FragCoord.x / 2.0);
    float pick = hash(vec2(column, blk.y + slot));
    suv.y = (blk.y + 1.0 + pick * 1.6) / grid.y;
    suv.x += (hash(vec2(blk.y, slot + 9.0)) - 0.5) * 0.12;
    streak = 0.85 + 0.45 * pick;
  }

  // Chromatic aberration, stronger towards the edges and inside a glitch.
  vec2 dir = (suv - 0.5) * (0.012 + active * 0.01);
  vec3 col = vec3(scene(suv + dir).r, scene(suv).g, scene(suv - dir).b) * streak;

  vec2 q = uv - 0.5;
  col *= 1.0 - dot(q, q) * 0.9;

  // Coarse film grain at 24 frames a second, in brightness and colour.
  float frame = mod(floor(t * 24.0), 97.0);
  vec2 px = gl_FragCoord.xy + frame * vec2(17.13, 31.71);
  float n = grainHash(px);
  vec3 cn = vec3(grainHash(px + 11.7), grainHash(px + 23.3), grainHash(px + 41.9));
  col += (n - 0.5) * 0.28 * (0.4 + col);
  col += (cn - 0.5) * 0.1;

  // A gentle filmic shoulder.
  col = col / (1.0 + col * 0.35);
  gl_FragColor = vec4(max(col, 0.0), 1.0);
}
`;
