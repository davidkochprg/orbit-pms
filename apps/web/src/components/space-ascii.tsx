import { useEffect, useRef } from 'react';
import {
  GLYPHS,
  glyphIndex,
  onPlanet,
  planetShade,
  ringShade,
  satellitePosition,
  scanShade,
  starShade,
} from '@/lib/space-scene';

const CELL_W = 8;
const CELL_H = 13;
const FRAME_MS = 1000 / 30;
const FONT = '11px ui-monospace, SFMono-Regular, Menlo, monospace';
/** Seconds each tracked satellite keeps the label before the next one takes it. */
const TRACK_SECONDS = 7;

export interface SpaceHud {
  /** e.g. "OCC 50%  ARR 08  DEP 06", from the demo hotel. */
  status: string;
}

interface SpaceAsciiProps {
  /** One satellite per label, e.g. today's arrival rooms; the HUD tracks them in turn. */
  satellites: string[];
  hud: SpaceHud;
}

/** Pre-renders each glyph in its brightness color, so a frame is only image copies. */
function buildAtlas(hue: string, dpr: number): HTMLCanvasElement {
  const atlas = document.createElement('canvas');
  atlas.width = GLYPHS.length * CELL_W * dpr;
  atlas.height = CELL_H * dpr;
  const ctx = atlas.getContext('2d')!;
  ctx.scale(dpr, dpr);
  ctx.font = FONT;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let i = 1; i < GLYPHS.length; i++) {
    const level = i / (GLYPHS.length - 1);
    ctx.fillStyle = `oklch(${0.42 + 0.53 * level} ${0.06 + 0.06 * level} ${hue} / ${0.35 + 0.65 * level})`;
    ctx.fillText(GLYPHS[i]!, i * CELL_W + CELL_W / 2, CELL_H / 2);
  }
  return atlas;
}

const pad = (n: number, width: number) => String(n).padStart(width, '0');

/**
 * An ASCII planet with a ring and orbiting satellites on a star field, rendered to a canvas at
 * 30 fps, with a mission-control HUD on top. Still when the system asks for reduced motion.
 */
export function SpaceAscii({ satellites, hud }: SpaceAsciiProps) {
  const container = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const frameText = useRef<HTMLSpanElement>(null);
  const gridText = useRef<HTMLSpanElement>(null);
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
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const hue =
      getComputedStyle(document.documentElement).getPropertyValue('--accent-hue').trim() || '256';
    const atlas = buildAtlas(hue, dpr);
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let width = 0;
    let height = 0;
    let raf = 0;
    let last = 0;
    const start = performance.now();

    function resize() {
      width = box!.clientWidth;
      height = box!.clientHeight;
      el!.width = Math.round(width * dpr);
      el!.height = Math.round(height * dpr);
      if (gridText.current) {
        gridText.current.textContent = `GRID ${Math.ceil(width / CELL_W)}×${Math.ceil(height / CELL_H)}`;
      }
    }

    function draw(t: number) {
      if (!ctx || width === 0) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      // Scene units: the shorter side spans -1..1, so the planet fits any panel shape.
      const half = Math.min(width, height) / 2;
      const cx = width / 2;
      const cy = height / 2;
      const cols = Math.ceil(width / CELL_W);
      const rows = Math.ceil(height / CELL_H);
      const sats = labels.current.map((label, i) => ({
        label,
        ...satellitePosition(i / Math.max(labels.current.length, 1), t),
      }));
      const satPx = sats
        .filter((s) => !s.hidden)
        .map((s) => ({ x: cx + s.u * half, y: cy + s.v * half, front: s.front }));

      for (let row = 0; row < rows; row++) {
        const y = row * CELL_H + CELL_H / 2;
        const v = (y - cy) / half;
        for (let col = 0; col < cols; col++) {
          const x = col * CELL_W + CELL_W / 2;
          const u = (x - cx) / half;
          let b = planetShade(u, v, t) ?? 0;
          const ring = ringShade(u, v);
          if (ring > 0) b = onPlanet(u, v) ? Math.max(ring + 0.22, b * 0.5) : ring;
          if (b === 0) b = starShade(col, row, t);
          for (const s of satPx) {
            const d = Math.hypot((x - s.x) / CELL_W, (y - s.y) / CELL_H);
            if (d < 1.6) b = Math.max(b, s.front ? 1 - d * 0.2 : 0.75 - d * 0.25);
          }
          if (b > 0) b += scanShade(v, t);
          const g = glyphIndex(b);
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
      const target =
        sats.length > 0
          ? Array.from({ length: sats.length }, (_, i) => sats[(turn + i) % sats.length]!).find(
              (s) => !s.hidden,
            )
          : undefined;
      if (tracker.current) {
        tracker.current.style.opacity = target ? '1' : '0';
        if (target) {
          tracker.current.style.transform = `translate(${cx + target.u * half}px, ${cy + target.v * half}px)`;
        }
      }
      if (target && trackerLabel.current) trackerLabel.current.textContent = `ROOM ${target.label}`;
      if (target && targetText.current) {
        targetText.current.textContent = `TARGET ${target.label} · ARRIVING TODAY`;
      }
      if (frameText.current) {
        const frame = Math.floor(t * 30) % 960;
        frameText.current.textContent = `F ${pad(frame, 4)}/0960  ${(t % 100).toFixed(2).padStart(5, '0')}S`;
      }
    }

    function loop(now: number) {
      raf = requestAnimationFrame(loop);
      if (now - last < FRAME_MS) return;
      last = now;
      draw((now - start) / 1000 + 4);
    }

    resize();
    const observer = new ResizeObserver(() => {
      resize();
      if (still) draw(8);
    });
    observer.observe(box);
    if (still) draw(8);
    else raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, []);

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
      <canvas ref={canvas} className="absolute inset-0 h-full w-full" />

      <div className="pointer-events-none absolute inset-0 font-mono text-[11px] leading-[1.6] tracking-wide text-space-ink uppercase">
        <div className="absolute top-6 left-6 flex flex-col sm:top-8 sm:left-8">
          <span>TRACK 01 &nbsp;ORBIT</span>
          <span ref={frameText}>F 0000/0960 &nbsp;00.00S</span>
          <span>{hud.status}</span>
        </div>
        <div className="absolute top-6 right-6 hidden flex-col items-end sm:top-8 sm:right-8 sm:flex">
          <span>ORBIT / PROPERTY 01</span>
          <span ref={gridText}>GRID</span>
        </div>
        <div className="absolute bottom-6 left-6 hidden sm:bottom-8 sm:left-8 sm:block">
          <span ref={targetText} />
        </div>

        <div
          ref={tracker}
          className="absolute top-0 left-0 opacity-0 transition-opacity duration-500"
          style={{ willChange: 'transform' }}
        >
          <div className="absolute -top-5 -left-5 size-10 border border-space-line" />
          <span
            ref={trackerLabel}
            className="absolute -top-10 -left-5 bg-space-tag px-1.5 py-0.5 whitespace-nowrap text-space-tag-ink"
          />
        </div>
      </div>
    </div>
  );
}
