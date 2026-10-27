/**
 * GLSL for the welcome scene, in two passes. The scene pass paints a blurred dusk over a mountain
 * ridge, like a night photo from a moving car, at low resolution into a texture. The post pass
 * runs at full resolution: halation, colour fringing, glitch windows (pixel-sort smears and ASCII
 * made from the image itself), a vignette and fine film grain. The palette lives here because it
 * is painted, not UI chrome.
 */

export const FULLSCREEN_VERTEX = `
attribute vec2 aPosition;
void main() {
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

const HASHES = `
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
`;

/** Stored at half brightness, so lights can glow past white for the halation in the post pass. */
export const SCENE_FRAGMENT = `
precision highp float;

uniform vec2 uRes;
uniform float uTime;
/** Pointer, -1..1 on each axis, for a little parallax. */
uniform vec2 uPointer;

${HASHES}

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

/** An out-of-focus light: a bright core and a wide, faint halo. */
vec3 glow(vec2 p, vec2 centre, vec2 radius, vec3 color) {
  vec2 d = (p - centre) / radius;
  float q = dot(d, d);
  return color * (exp(-q * 2.5) + 0.25 * exp(-q * 0.25));
}

void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  float aspect = uRes.x / uRes.y;
  float t = uTime;
  vec2 par = uPointer * vec2(0.02, 0.012);
  // The camera drifts slowly sideways, as if from a moving car.
  float drift = t * 0.01;

  // Sky: night blue overhead, dusty blue, then a lavender haze towards the hills.
  vec3 col = mix(vec3(0.16, 0.27, 0.52), vec3(0.03, 0.07, 0.18), smoothstep(0.45, 1.0, uv.y));
  col = mix(col, vec3(0.5, 0.42, 0.66), smoothstep(0.62, 0.36, uv.y) * 0.75);
  col *= 0.78 + 0.4 * fbm(vec2(uv.x * 1.8 + drift * 0.6, uv.y * 3.5) + par);

  // Warm town glow behind the ridge, stronger to the right.
  float horizon = exp(-pow((uv.y - 0.36) * 7.0, 2.0));
  col += vec3(1.0, 0.48, 0.3) * horizon * (0.25 + 0.35 * smoothstep(0.2, 1.0, uv.x));

  // A light leak sweeping down from the top right.
  float x = uv.x + par.x;
  float bandY = 0.64 + (x - 0.78) * 0.6 + 0.03 * sin(t * 0.13);
  float band = exp(-pow((uv.y - bandY) * 6.0, 2.0)) * smoothstep(0.3, 1.0, x);
  col = mix(col, vec3(0.92, 0.5, 0.58), band * 0.5);
  col += vec3(1.0, 0.58, 0.3) * pow(band, 2.2) * 0.9 * (0.85 + 0.15 * sin(t * 0.4));
  col += vec3(0.8, 1.0, 0.86) * pow(band, 8.0) * 0.8 * smoothstep(0.65, 1.0, x);

  // Two red planets.
  vec2 sq = uv * vec2(aspect, 1.0);
  col += glow(sq, vec2(0.2 * aspect, 0.86) + par, vec2(0.012), vec3(1.0, 0.32, 0.26)) * 1.4;
  col += glow(sq, vec2(0.3 * aspect, 0.78) + par * 1.3, vec2(0.015), vec3(1.0, 0.42, 0.3)) * 1.2;

  // A far, hazy ridge and a near, dark one, both out of focus.
  float far = 0.4 + 0.08 * fbm(vec2((uv.x + drift * 0.5 + par.x * 0.5) * 3.0, 2.0));
  col = mix(col, vec3(0.16, 0.12, 0.26), smoothstep(far + 0.02, far - 0.03, uv.y) * 0.85);
  float near = 0.3 + 0.15 * fbm(vec2((uv.x + drift + par.x) * 1.8 + 5.0, 0.4)) - 0.05 * uv.x;
  vec3 ground = mix(vec3(0.04, 0.025, 0.06), vec3(0.008, 0.006, 0.016), smoothstep(0.28, 0.0, uv.y));
  col = mix(col, ground, smoothstep(near + 0.03, near - 0.05, uv.y));

  // Head and tail lights streaking past on the road below.
  for (int i = 0; i < 12; i++) {
    float fi = float(i);
    float h1 = hash(vec2(fi, 1.3));
    float h2 = hash(vec2(fi, 7.1));
    float h3 = hash(vec2(fi, 3.9));
    float speed = (0.01 + h3 * 0.03) * (h1 > 0.5 ? 1.0 : -1.0);
    vec2 pos = vec2(fract(h1 + t * speed) * 1.3 - 0.15 + par.x * (1.5 + h3), 0.04 + h2 * 0.2);
    vec3 c = h3 > 0.7 ? vec3(0.45, 1.0, 0.9) : (h3 > 0.4 ? vec3(1.0, 0.86, 0.62) : vec3(1.0, 0.38, 0.14));
    vec2 size = vec2(0.04 + h2 * 0.07, 0.012 + h1 * 0.012);
    col += glow(uv, pos, size, c) * (0.7 + 0.3 * sin(t * (0.5 + h1) + fi)) * 1.1;
  }

  gl_FragColor = vec4(min(col * 0.5, 1.0), 1.0);
}
`;

export const POST_FRAGMENT = `
precision highp float;

uniform sampler2D uScene;
/** One row of glyphs, darkest to brightest, white on transparent. */
uniform sampler2D uAtlas;
uniform float uGlyphs;
uniform vec2 uRes;
uniform float uTime;
/** One glyph cell, in pixels. Cells count from the top left, like the text overlay. */
uniform vec2 uCell;
/**
 * Glitch windows in pixels, y up: x0, y0, x1, y1, already cut to the part wiped on. Kind:
 * 1 smear, 2 ASCII over the image, 3 data backdrop, 4 ASCII over a smear. Opaque, hard-edged.
 */
uniform vec4 uWin[12];
uniform float uWinKind[12];
/** 1 at load, easing to 0: the picture starts as ASCII and resolves from the top down. */
uniform float uIntro;

${HASHES}

vec3 sceneAt(vec2 uv) {
  return texture2D(uScene, clamp(uv, 0.001, 0.999)).rgb * 2.0;
}

float luma(vec3 c) {
  return dot(c, vec3(0.299, 0.587, 0.114));
}

vec3 tone(vec3 c) {
  return 1.0 - exp(-c * 1.25);
}

/** The brightest of a few samples down a column: what pixel sorting drags to the front. */
float sortedRow(float stripe, float seed, float x) {
  float best = -1.0;
  float row = 0.5;
  for (int k = 0; k < 4; k++) {
    float y = 0.08 + 0.84 * hash(vec2(stripe + float(k) * 13.0, seed));
    float l = luma(sceneAt(vec2(x, y)));
    if (l > best) {
      best = l;
      row = y;
    }
  }
  return row;
}

void main() {
  vec2 frag = gl_FragCoord.xy;
  vec2 uv = frag / uRes;
  float frame = mod(floor(uTime * 24.0), 97.0);

  // The topmost window under this pixel, if any.
  float kind = 0.0;
  vec4 win = vec4(0.0);
  for (int i = 0; i < 12; i++) {
    vec4 r = uWin[i];
    if (uWinKind[i] > 0.5 && frag.x >= r.x && frag.x < r.z && frag.y >= r.y && frag.y < r.w) {
      kind = uWinKind[i];
      win = r;
    }
  }
  bool smear = (kind > 0.5 && kind < 1.5) || kind > 3.5;
  bool ascii = (kind > 1.5 && kind < 2.5) || kind > 3.5;
  bool backdrop = kind > 2.5 && kind < 3.5;
  vec2 fromTop = vec2(frag.x, uRes.y - frag.y);
  float sweep = floor(fromTop.y / uCell.y) / (uRes.y / uCell.y);
  if (uIntro > 0.0 && hash(floor(fromTop / uCell) * 0.73) * 0.5 + sweep * 0.5 < uIntro) {
    ascii = true;
  }

  // Colour fringing towards the edges.
  vec2 dir = (uv - 0.5) * 0.004;
  vec3 col = vec3(sceneAt(uv + dir).r, sceneAt(uv).g, sceneAt(uv - dir).b);

  // Pixel sort: stripes drag the brightest colour of their column through the window with a soft
  // gradient, replacing the picture there.
  if (smear || backdrop) {
    float s = frag.x / (uCell.x * 0.6);
    float a = sortedRow(floor(s), win.w, uv.x);
    float b = sortedRow(floor(s) + 1.0, win.w, uv.x);
    float y = mix(a, b, smoothstep(0.2, 0.8, fract(s))) + (frag.y - win.y) / uRes.y * 0.3;
    vec2 suv = vec2(uv.x + (hash(vec2(win.y, win.w)) - 0.5) * 0.03, y);
    vec2 side = vec2(0.004, 0.0);
    vec3 sorted = vec3(sceneAt(suv + side).r, sceneAt(suv).g, sceneAt(suv - side).b);
    sorted = mix(vec3(luma(sorted)), sorted, 1.25);
    sorted *= 0.9 + 0.2 * hash(vec2(floor(s) * 1.7, win.w + 3.0));
    if (backdrop) sorted *= 0.3;
    col = sorted;
  }

  // Halation: bright lights bleed a warm glow into their surroundings.
  vec3 halo = vec3(0.0);
  for (int i = 0; i < 8; i++) {
    float a = float(i) * 0.785398;
    vec2 o = vec2(cos(a), sin(a));
    halo += sceneAt(uv + o * vec2(0.012, 0.016)) + sceneAt(uv + o * vec2(0.03, 0.04));
  }
  col += max(halo / 16.0 - 0.35, 0.0) * vec3(1.0, 0.75, 0.6) * 0.9;
  col = tone(col);

  // ASCII made from the image: each cell's glyph follows the brightness beneath it.
  if (ascii) {
    vec2 cell = floor(fromTop / uCell);
    vec2 inCell = fract(fromTop / uCell);
    vec2 centre = vec2((cell.x + 0.5) * uCell.x, uRes.y - (cell.y + 0.5) * uCell.y) / uRes;
    vec3 under = tone(sceneAt(centre));
    // Dark areas get sparse dots; only the lights fill up with heavy glyphs.
    float level = clamp(smoothstep(0.03, 0.8, luma(under)), 0.0, 0.999);
    float index = floor(level * uGlyphs);
    if (hash(cell + frame * 0.37) > 0.965) index = floor(hash(cell.yx + frame) * uGlyphs);
    float ink = texture2D(uAtlas, vec2((index + inCell.x) / uGlyphs, inCell.y)).a;
    col = mix(col, vec3(0.97), ink);
  }

  vec2 q = uv - 0.5;
  col *= 1.0 - dot(q * vec2(0.9, 1.1), q) * 0.75;
  col *= 1.0 - uIntro * 0.5;

  // Fine film grain at 24 frames a second, strongest in the shadows, with a touch of colour.
  vec2 px = frag + frame * vec2(17.13, 31.71);
  float n = grainHash(px) + grainHash(px * 1.37 + 5.1) - 1.0;
  col += n * 0.065 * (1.0 - luma(col) * 0.6);
  col += (vec3(grainHash(px + 11.7), grainHash(px + 23.3), grainHash(px + 41.9)) - 0.5) * 0.022;

  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;
