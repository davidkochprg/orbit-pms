/**
 * GLSL for the welcome scene, in two passes. The scene pass draws the hero photo, cover-fitted
 * and slowly moving, into a texture. The post pass runs at full resolution: halation, colour
 * fringing, glitch windows (pixel-sort smears and ASCII made from the image itself), a vignette
 * and fine film grain.
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

/**
 * The photo (a storm over a meadow), cover-fitted with its light break under the storm kept in
 * the part of the page the panel leaves open. It breathes in and out slowly, shifts a little
 * with the pointer, and the grass in front sways in the wind. Stored so that the post pass's
 * tone curve gives the photo back, at half brightness for headroom.
 */
export const SCENE_FRAGMENT = `
precision highp float;

uniform sampler2D uPhoto;
uniform vec2 uPhotoSize;
uniform vec2 uRes;
uniform float uTime;
/** Pointer, -1..1 on each axis, for a little parallax. */
uniform vec2 uPointer;
/** The share of the width not covered by the page's panel, where the picture is composed. */
uniform float uFrame;

/** Across the photo: the bright break in the clouds and the rain falling in front of it. */
const float FOCUS = 0.36;

void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  float screen = uRes.x / uRes.y;
  float photo = uPhotoSize.x / uPhotoSize.y;
  // The visible part of the photo, in its own 0..1 coordinates, with room to drift.
  vec2 span = screen > photo ? vec2(1.0, photo / screen) : vec2(screen / photo, 1.0);
  span /= 1.08 + 0.025 * sin(uTime * 0.045);
  vec2 slack = 1.0 - span;
  float left = clamp(FOCUS - span.x * uFrame * 0.5, 0.0, slack.x);
  vec2 origin = vec2(left, slack.y * 0.5);
  origin = clamp(origin - uPointer * vec2(0.012, 0.008), vec2(0.0), slack);
  vec2 p = origin + uv * span;

  // Wind through the grass: a gentle sideways sway, strongest in the foreground.
  float grass = smoothstep(0.5, 0.0, p.y);
  float gust = 0.6 + 0.4 * sin(uTime * 0.31 + p.x * 3.0);
  p.x += grass * gust * 0.0022 * sin(p.y * 46.0 + uTime * 1.7 + 2.0 * sin(p.x * 11.0 + uTime * 0.6));

  vec3 c = texture2D(uPhoto, clamp(p, vec2(0.001), vec2(0.999))).rgb;
  // The inverse of the post pass's tone curve, so the photo comes out as it was shot.
  vec3 linear = -log(max(1.0 - c * 0.97, 0.001)) / 1.25;
  gl_FragColor = vec4(min(linear * 0.5, 1.0), 1.0);
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
