import { useEffect, useRef } from 'react';
import {
  bayer,
  DEFAULT_LIGHT,
  GLYPHS,
  glitchOffset,
  NOISE_GLYPHS,
  glyphIndex,
  haloShade,
  hash,
  lightFrom,
  onPlanet,
  orbitPoint,
  planetShade,
  revealAt,
  ringShade,
  satellitePosition,
  scanShade,
  shootingStar,
  starShade,
  type Vec3,
} from '@/lib/space-scene';

const CELL_W = 7;
const CELL_H = 11;
const FRAME_MS = 1000 / 30;
const FONT = '10px ui-monospace, SFMono-Regular, Menlo, monospace';
/** Seconds each tracked satellite keeps the label before the next one takes it. */
const TRACK_SECONDS = 7;
const TRAIL_STEPS = 14;
const ORBIT_SAMPLES = 220;

export interface SpaceHud {
  /** e.g. "OCC 50%  ARR 08  DEP 06", from the demo hotel. */
  status: string;
}

interface SpaceAsciiProps {
  /** One satellite per label, e.g. today's arrival rooms; the HUD tracks them in turn. */
  satellites: string[];
  hud: SpaceHud;
}

/**
 * Pre-renders each glyph in its brightness color, so a frame is only image copies: the ramp
 * first, then the noise glyphs used while decoding and glitching.
 */
function buildAtlas(hue: string, dpr: number): HTMLCanvasElement {
  const atlas = document.createElement('canvas');
  atlas.width = (GLYPHS.length + NOISE_GLYPHS.length) * CELL_W * dpr;
  atlas.height = CELL_H * dpr;
  const ctx = atlas.getContext('2d')!;
  ctx.scale(dpr, dpr);
  ctx.font = FONT;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let i = 1; i < GLYPHS.length; i++) {
    const level = i / (GLYPHS.length - 1);
    // Deep, saturated accent in the shadows; nearly white in the highlights.
    const lightness = 0.36 + 0.62 * level ** 0.9;
    const chroma = 0.17 * (1 - level) ** 1.4 + 0.015;
    ctx.fillStyle = `oklch(${lightness} ${chroma} ${hue} / ${0.45 + 0.55 * level})`;
    ctx.fillText(GLYPHS[i]!, i * CELL_W + CELL_W / 2, CELL_H / 2);
  }
  for (let i = 0; i < NOISE_GLYPHS.length; i++) {
    ctx.fillStyle = `oklch(0.86 0.06 ${hue} / ${0.55 + 0.4 * (i % 2)})`;
    ctx.fillText(NOISE_GLYPHS[i]!, (GLYPHS.length + i) * CELL_W + CELL_W / 2, CELL_H / 2);
  }
  return atlas;
}

/** A tile of random grey pixels for the film grain overlay. */
function grainTile(): string {
  const size = 160;
  const tile = document.createElement('canvas');
  tile.width = size;
  tile.height = size;
  const ctx = tile.getContext('2d')!;
  const image = ctx.createImageData(size, size);
  for (let i = 0; i < image.data.length; i += 4) {
    const g = Math.random() * 255;
    image.data[i] = g;
    image.data[i + 1] = g;
    image.data[i + 2] = g;
    image.data[i + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
  return tile.toDataURL();
}

const pad = (n: number, width: number) => String(n).padStart(width, '0');
const signed = (n: number) => `${n < 0 ? '−' : '+'}${Math.abs(n).toFixed(2)}`;

/**
 * An ASCII planet with a ring and orbiting satellites on a star field, rendered to a canvas at
 * 30 fps with dithering, grain, scanlines and glitches, and a mission-control HUD on top. The
 * sunlight follows the pointer. Renders one still frame when the system asks for reduced motion.
 */
export function SpaceAscii({ satellites, hud }: SpaceAsciiProps) {
  const container = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const grain = useRef<HTMLDivElement>(null);
  const frameText = useRef<HTMLSpanElement>(null);
  const gridText = useRef<HTMLSpanElement>(null);
  const luxText = useRef<HTMLSpanElement>(null);
  const targetText = useRef<HTMLSpanElement>(null);
  const tracker = useRef<HTMLDivElement>(null);
  const trackerLabel = useRef<HTMLSpanElement>(null);
  const labels = useRef(satellites);
  // The animation reads the latest labels without restarting.
  useEffect(() => {
    labels.current = satellites;
  }, [satellites]);

  useEffect(() => {
    const box = container.current;
    const el = canvas.current;
    if (!box || !el) return;
    const ctx = el.getContext('2d');
    if (!ctx) return;
    // Capped: the glow filters work on every canvas pixel each frame.
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const hue =
      getComputedStyle(document.documentElement).getPropertyValue('--accent-hue').trim() || '256';
    const atlas = buildAtlas(hue, dpr);
    if (grain.current) grain.current.style.backgroundImage = `url(${grainTile()})`;
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let width = 0;
    let height = 0;
    let cols = 0;
    let rows = 0;
    let buffer = new Float32Array(0);
    let raf = 0;
    let last = 0;
    const start = performance.now();
    const light: Vec3 = [...DEFAULT_LIGHT];
    let target: Vec3 = DEFAULT_LIGHT;

    function resize() {
      width = box!.clientWidth;
      height = box!.clientHeight;
      el!.width = Math.round(width * dpr);
      el!.height = Math.round(height * dpr);
      cols = Math.ceil(width / CELL_W);
      rows = Math.ceil(height / CELL_H);
      buffer = new Float32Array(cols * rows);
      if (gridText.current) gridText.current.textContent = `GRID ${cols}×${rows}`;
    }

    function onPointer(e: PointerEvent) {
      const rect = box!.getBoundingClientRect();
      const px = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const py = ((e.clientY - rect.top) / rect.height) * 2 - 1;
      target = lightFrom(px, py);
    }
    function onLeave() {
      target = DEFAULT_LIGHT;
    }

    /** Brightens the cell under a scene point, keeping the brightest value. */
    function stamp(x: number, y: number, b: number) {
      const col = Math.floor(x / CELL_W);
      const row = Math.floor(y / CELL_H);
      if (col < 0 || row < 0 || col >= cols || row >= rows) return;
      const i = row * cols + col;
      if (buffer[i]! < b) buffer[i] = b;
    }

    function draw(t: number, elapsed: number) {
      if (!ctx || width === 0) return;
      for (let k = 0; k < 3; k++) light[k] = light[k]! + (target[k]! - light[k]!) * 0.08;

      // Scene units: the shorter side spans -1..1, so the planet fits any panel shape.
      const half = Math.min(width, height) / 2;
      const cx = width / 2;
      const cy = height / 2;
      const toX = (u: number) => cx + u * half;
      const toY = (v: number) => cy + v * half;

      for (let row = 0; row < rows; row++) {
        const shift = glitchOffset(row, t);
        const y = row * CELL_H + CELL_H / 2;
        const v = (y - cy) / half;
        for (let col = 0; col < cols; col++) {
          const x = (col + shift) * CELL_W + CELL_W / 2;
          const u = (x - cx) / half;
          let b = planetShade(u, v, t, light) ?? haloShade(u, v, light);
          const ring = ringShade(u, v);
          if (ring > 0) b = onPlanet(u, v) ? Math.max(ring + 0.24, b * 0.45) : Math.max(b, ring);
          if (b === 0) b = starShade(col, row, t);
          buffer[row * cols + col] = b;
        }
      }

      // A dotted orbit path, then fading trails behind each satellite, then the satellites.
      for (let i = 0; i < ORBIT_SAMPLES; i += 2) {
        const p = orbitPoint((i / ORBIT_SAMPLES) * Math.PI * 2);
        if (!p.hidden) stamp(toX(p.u), toY(p.v), p.front ? 0.16 : 0.09);
      }
      const sats = labels.current.map((label, i) => {
        const phase = i / Math.max(labels.current.length, 1);
        return { label, phase, ...satellitePosition(phase, t) };
      });
      for (const s of sats) {
        for (let k = TRAIL_STEPS; k >= 1; k--) {
          const p = satellitePosition(s.phase, t - k * 0.09);
          if (!p.hidden) stamp(toX(p.u), toY(p.v), 0.7 * (1 - k / (TRAIL_STEPS + 1)) ** 1.5);
        }
        if (s.hidden) continue;
        const x = toX(s.u);
        const y = toY(s.v);
        for (const [dx, dy, b] of [
          [0, 0, 1],
          [-CELL_W, 0, 0.75],
          [CELL_W, 0, 0.75],
          [0, -CELL_H, 0.7],
          [0, CELL_H, 0.7],
        ] as const) {
          stamp(x + dx, y + dy, s.front ? b : b * 0.7);
        }
      }
      const meteor = shootingStar(t);
      if (meteor) {
        for (let k = 0; k < 18; k++) {
          const back = k * 0.022;
          stamp(toX(meteor.u - meteor.du * back), toY(meteor.v - meteor.dv * back), 1 - k / 18);
        }
      }

      // Dither and grain each frame, then draw: scrambled glyphs until a cell is revealed.
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      const frame = Math.floor(t * 30);
      for (let row = 0; row < rows; row++) {
        const v = (row * CELL_H + CELL_H / 2 - cy) / half;
        const scan = scanShade(v, t);
        const tear = glitchOffset(row, t) !== 0;
        for (let col = 0; col < cols; col++) {
          let b = buffer[row * cols + col]!;
          if (b > 0.02) {
            b += scan + bayer(col, row) * 0.1 + (hash(col + frame * 0.618, row) - 0.5) * 0.07;
          }
          let g = glyphIndex(b);
          const scramble = hash(col * 1.3 + frame, row * 0.7);
          const noise = GLYPHS.length + Math.floor(scramble * NOISE_GLYPHS.length * 0.999);
          if (elapsed < revealAt(col, row, cols, rows)) {
            g =
              b > 0.04
                ? scramble > 0.55
                  ? noise
                  : 1 + Math.floor(scramble * (GLYPHS.length - 2))
                : scramble > 0.985
                  ? noise
                  : 0;
          } else if (tear && g > 0 && scramble > 0.6) {
            g = noise;
          }
          if (g > 0) {
            ctx.drawImage(
              atlas,
              g * CELL_W * dpr,
              0,
              CELL_W * dpr,
              CELL_H * dpr,
              col * CELL_W,
              row * CELL_H,
              CELL_W,
              CELL_H,
            );
          }
        }
      }

      // The HUD tracks one satellite at a time, skipping any hidden behind the planet.
      const turn = Math.floor(t / TRACK_SECONDS);
      const tracked =
        sats.length > 0
          ? Array.from({ length: sats.length }, (_, i) => sats[(turn + i) % sats.length]!).find(
              (s) => !s.hidden,
            )
          : undefined;
      if (tracker.current) {
        tracker.current.style.opacity = tracked && elapsed > 1.6 ? '1' : '0';
        if (tracked) {
          tracker.current.style.transform = `translate(${toX(tracked.u)}px, ${toY(tracked.v)}px)`;
        }
      }
      if (tracked && trackerLabel.current)
        trackerLabel.current.textContent = `ROOM ${tracked.label}`;
      if (tracked && targetText.current) {
        targetText.current.textContent = `TARGET ${tracked.label} · ARRIVING TODAY`;
      }
      if (frameText.current) {
        frameText.current.textContent = `F ${pad(frame % 960, 4)}/0960  ${(t % 100).toFixed(2).padStart(5, '0')}S`;
      }
      if (luxText.current) {
        luxText.current.textContent = `LUX ${signed(light[0])} ${signed(light[1])} ${signed(light[2])}`;
      }
    }

    function loop(now: number) {
      raf = requestAnimationFrame(loop);
      if (now - last < FRAME_MS) return;
      last = now;
      const elapsed = (now - start) / 1000;
      draw(elapsed + 4, elapsed);
    }

    resize();
    const observer = new ResizeObserver(() => {
      resize();
      if (still) draw(8, 99);
    });
    observer.observe(box);
    box.addEventListener('pointermove', onPointer);
    box.addEventListener('pointerleave', onLeave);
    if (still) draw(8, 99);
    else raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      box.removeEventListener('pointermove', onPointer);
      box.removeEventListener('pointerleave', onLeave);
    };
  }, []);

  const bracket = 'absolute size-5 border-space-line';
  return (
    <div
      ref={container}
      aria-hidden
      className="relative h-full w-full overflow-hidden"
      style={{
        background:
          'radial-gradient(120% 90% at 50% 110%, var(--space-horizon) 0%, var(--space-mid) 55%, var(--space-deep) 100%)',
      }}
    >
      <canvas
        ref={canvas}
        className="absolute inset-0 h-full w-full"
        style={{
          filter:
            'drop-shadow(0 0 3px var(--space-glow)) drop-shadow(1.2px 0 0 var(--space-fringe-warm)) drop-shadow(-1.2px 0 0 var(--space-fringe-cool))',
        }}
      />
      <div ref={grain} className="space-grain" />
      <div className="space-scanlines pointer-events-none absolute inset-0" />
      <div className="space-vignette pointer-events-none absolute inset-0" />

      <div className="pointer-events-none absolute inset-0 font-mono text-[11px] leading-[1.6] tracking-wide text-space-ink uppercase">
        <span className={`${bracket} top-4 left-4 border-t border-l`} />
        <span className={`${bracket} top-4 right-4 border-t border-r`} />
        <span className={`${bracket} bottom-4 left-4 border-b border-l`} />
        <span className={`${bracket} right-4 bottom-4 border-r border-b`} />

        <div className="absolute top-8 left-8 flex flex-col">
          <span>TRACK 01 &nbsp;ORBIT</span>
          <span ref={frameText}>F 0000/0960 &nbsp;00.00S</span>
          <span>{hud.status}</span>
        </div>
        <div className="absolute top-8 right-8 hidden flex-col items-end sm:flex">
          <span>ORBIT / PROPERTY 01</span>
          <span ref={gridText}>GRID</span>
          <span ref={luxText}>LUX</span>
        </div>

        {/* A tick ruler down the left edge. */}
        <div className="absolute top-1/2 left-4 hidden -translate-y-1/2 flex-col gap-[7px] sm:flex">
          {Array.from({ length: 25 }, (_, i) => (
            <span
              key={i}
              className={i % 6 === 0 ? 'h-px w-3 bg-space-ink/70' : 'h-px w-1.5 bg-space-ink/35'}
            />
          ))}
        </div>

        <div className="absolute bottom-8 left-8 hidden sm:block">
          <span ref={targetText} />
        </div>
        <div className="absolute right-8 bottom-8 hidden items-center gap-1.5 sm:flex">
          <span>SIGNAL</span>
          <span className="flex items-end gap-[2px]">
            {[4, 6, 8, 10].map((h, i) => (
              <span
                key={h}
                className="space-signal w-[3px] bg-space-ink"
                style={{ height: h, animationDelay: `${i * 180}ms` }}
              />
            ))}
          </span>
        </div>

        <div
          ref={tracker}
          className="absolute top-0 left-0 opacity-0 transition-opacity duration-500"
          style={{ willChange: 'transform' }}
        >
          <div className="absolute -top-5 -left-5 size-10 border border-space-line" />
          <div className="absolute top-0 left-5 h-px w-6 bg-space-line" />
          <span
            ref={trackerLabel}
            className="absolute -top-10 -left-5 bg-space-tag px-1.5 py-0.5 whitespace-nowrap text-space-tag-ink"
          />
        </div>
      </div>
    </div>
  );
}
