import { useEffect, useRef } from 'react';
import { DUSK_FRAGMENT, DUSK_VERTEX } from '@/lib/dusk-shader';
import { activeClusters, clusterAlpha, clusterGlyph } from '@/lib/glyph-clusters';

/** The shader renders at this share of the panel's pixels; the scene is soft, so it hides. */
const SHADER_SCALE = 0.6;
const FRAME_MS = 1000 / 24;
const CELL_W = 10;
const CELL_H = 16;
const FONT = '600 13px ui-monospace, SFMono-Regular, Menlo, monospace';
/** Matches the size of the shader's uSmear array. */
const MAX_SMEARS = 6;

interface WelcomeSceneProps {
  /** Short lines of live hotel data that some glyph clusters show, e.g. "OCC 50%". */
  data: string[];
  /** One line in the corner, e.g. the property and today's numbers. */
  caption: string;
}

function compile(gl: WebGLRenderingContext, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error(gl.getShaderInfoLog(shader));
    return null;
  }
  return shader;
}

/** Sets up the dusk shader on a canvas, or returns null if WebGL is unavailable. */
function createDusk(canvas: HTMLCanvasElement) {
  const gl = canvas.getContext('webgl', { antialias: false, premultipliedAlpha: false });
  if (!gl) return null;
  const vertex = compile(gl, gl.VERTEX_SHADER, DUSK_VERTEX);
  const fragment = compile(gl, gl.FRAGMENT_SHADER, DUSK_FRAGMENT);
  const program = gl.createProgram();
  if (!vertex || !fragment || !program) return null;
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;
  gl.useProgram(program);
  // One triangle that covers the whole viewport.
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const position = gl.getAttribLocation(program, 'aPosition');
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
  const uRes = gl.getUniformLocation(program, 'uRes');
  const uTime = gl.getUniformLocation(program, 'uTime');
  const uPointer = gl.getUniformLocation(program, 'uPointer');
  const uSmear = gl.getUniformLocation(program, 'uSmear');
  return {
    draw(
      width: number,
      height: number,
      time: number,
      pointer: [number, number],
      smears: Float32Array,
    ) {
      gl.viewport(0, 0, width, height);
      gl.uniform4fv(uSmear, smears);
      gl.uniform2f(uRes, width, height);
      gl.uniform1f(uTime, time);
      gl.uniform2f(uPointer, pointer[0], pointer[1]);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
  };
}

/**
 * The welcome page's left panel: a grainy, out-of-focus dusk painted by a shader, with
 * pixel-sort glitches, and blocks of monospace glyphs flickering over it, some spelling out the
 * demo hotel's live numbers. One still frame with reduced motion; a plain gradient without WebGL.
 */
export function WelcomeScene({ data, caption }: WelcomeSceneProps) {
  const container = useRef<HTMLDivElement>(null);
  const shaderCanvas = useRef<HTMLCanvasElement>(null);
  const glyphCanvas = useRef<HTMLCanvasElement>(null);
  const lines = useRef(data);
  // The animation reads the latest data without restarting.
  useEffect(() => {
    lines.current = data;
  }, [data]);

  useEffect(() => {
    const box = container.current;
    const gl = shaderCanvas.current;
    const text = glyphCanvas.current;
    const ctx = text?.getContext('2d');
    if (!box || !gl || !text || !ctx) return;
    const dusk = createDusk(gl);
    if (!dusk) gl.style.display = 'none';
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const glyphColor = getComputedStyle(box).getPropertyValue('--scene-glyph').trim() || 'white';
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let width = 0;
    let height = 0;
    let raf = 0;
    let last = 0;
    const start = performance.now();
    const pointer: [number, number] = [0, 0];
    const smears = new Float32Array(MAX_SMEARS * 4);
    let target: [number, number] = [0, 0];

    function resize() {
      width = box!.clientWidth;
      height = box!.clientHeight;
      gl!.width = Math.max(1, Math.round(width * SHADER_SCALE));
      gl!.height = Math.max(1, Math.round(height * SHADER_SCALE));
      text!.width = Math.round(width * dpr);
      text!.height = Math.round(height * dpr);
    }

    function draw(t: number) {
      pointer[0] += (target[0] - pointer[0]) * 0.06;
      pointer[1] += (target[1] - pointer[1]) * 0.06;
      const grid = { cols: Math.floor(width / CELL_W), rows: Math.floor(height / CELL_H) };
      const clusters = activeClusters(t, grid, lines.current);
      // Smear bands behind clusters, in the shader's 0..1 coordinates with y up.
      smears.fill(0);
      clusters
        .filter((c) => c.smearFrom !== null && clusterAlpha(c, t) > 0.5)
        .slice(0, MAX_SMEARS)
        .forEach((c, i) => {
          smears.set(
            [
              (c.smearFrom! * CELL_W) / width,
              1 - ((c.row + c.height) * CELL_H) / height,
              ((c.col + c.width) * CELL_W) / width,
              1 - (c.row * CELL_H) / height,
            ],
            i * 4,
          );
        });
      dusk?.draw(gl!.width, gl!.height, t, pointer, smears);

      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx!.clearRect(0, 0, width, height);
      ctx!.font = FONT;
      ctx!.textBaseline = 'top';
      ctx!.fillStyle = glyphColor;
      ctx!.shadowColor = glyphColor;
      ctx!.shadowBlur = 6;
      ctx!.globalAlpha = 1;
      for (const cluster of clusters) {
        const alpha = clusterAlpha(cluster, t);
        if (alpha <= 0) continue;
        ctx!.globalAlpha = 0.92 * alpha;
        for (let y = 0; y < cluster.height; y++) {
          for (let x = 0; x < cluster.width; x++) {
            const glyph = clusterGlyph(cluster, x, y, t);
            if (glyph) {
              ctx!.fillText(glyph, (cluster.col + x) * CELL_W, (cluster.row + y) * CELL_H);
            }
          }
        }
      }
    }

    function loop(now: number) {
      raf = requestAnimationFrame(loop);
      if (now - last < FRAME_MS) return;
      last = now;
      draw((now - start) / 1000 + 3);
    }

    function onPointer(e: PointerEvent) {
      const rect = box!.getBoundingClientRect();
      target = [
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        1 - ((e.clientY - rect.top) / rect.height) * 2,
      ];
    }
    function onLeave() {
      target = [0, 0];
    }

    resize();
    const observer = new ResizeObserver(() => {
      resize();
      if (still) draw(7);
    });
    observer.observe(box);
    box.addEventListener('pointermove', onPointer);
    box.addEventListener('pointerleave', onLeave);
    if (still) draw(7);
    else raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      box.removeEventListener('pointermove', onPointer);
      box.removeEventListener('pointerleave', onLeave);
    };
  }, []);

  return (
    <div
      ref={container}
      aria-hidden
      className="relative h-full w-full overflow-hidden"
      style={{
        background:
          'linear-gradient(to bottom, var(--scene-sky) 0%, var(--scene-haze) 55%, var(--scene-ground) 100%)',
      }}
    >
      <canvas ref={shaderCanvas} className="absolute inset-0 h-full w-full" />
      <canvas ref={glyphCanvas} className="absolute inset-0 h-full w-full" />
      <p className="absolute bottom-6 left-6 font-mono text-[11px] tracking-wider text-scene-glyph/80 uppercase sm:bottom-8 sm:left-8">
        {caption}
      </p>
    </div>
  );
}
