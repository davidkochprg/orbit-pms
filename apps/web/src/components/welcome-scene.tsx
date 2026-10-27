import { useEffect, useRef } from 'react';
import { FULLSCREEN_VERTEX, POST_FRAGMENT, SCENE_FRAGMENT } from '@/lib/dusk-shader';
import { type Cell, type GlitchWindow, MAX_WINDOWS, windowsAt } from '@/lib/glitch-windows';

/** The scene pass renders at this share of the panel's CSS pixels; its softness reads as blur. */
const SCENE_SCALE = 0.5;
const FRAME_MS = 1000 / 24;
const CELL_W = 10;
const CELL_H = 16;
/** Glyphs for ASCII windows, from least to most ink. */
const RAMP = ' ._/I4SXH8#M';
const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';
const KIND_CODE: Record<GlitchWindow['kind'], number> = {
  sort: 1,
  ascii: 2,
  data: 3,
  glyphsort: 4,
};

interface WelcomeSceneProps {
  /** Lines of live hotel data, shown one at a time, e.g. "OCC 50% · 25 OF 50 ROOMS". */
  data: string[];
  /** One line in the corner, e.g. the property and today's numbers. */
  caption: string;
}

function program(gl: WebGLRenderingContext, fragment: string): WebGLProgram | null {
  const p = gl.createProgram();
  if (!p) return null;
  for (const [type, source] of [
    [gl.VERTEX_SHADER, FULLSCREEN_VERTEX],
    [gl.FRAGMENT_SHADER, fragment],
  ] as const) {
    const shader = gl.createShader(type);
    if (!shader) return null;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error(gl.getShaderInfoLog(shader));
      return null;
    }
    gl.attachShader(p, shader);
  }
  gl.linkProgram(p);
  return gl.getProgramParameter(p, gl.LINK_STATUS) ? p : null;
}

function texture(gl: WebGLRenderingContext, filter: number): WebGLTexture | null {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return tex;
}

/** The glyph ramp drawn white on transparent, one cell per glyph, at the canvas's pixel scale. */
function glyphAtlas(scale: number): HTMLCanvasElement {
  const atlas = document.createElement('canvas');
  atlas.width = Math.round(RAMP.length * CELL_W * scale);
  atlas.height = Math.round(CELL_H * scale);
  const ctx = atlas.getContext('2d')!;
  ctx.scale(scale, scale);
  ctx.font = `600 13px ${MONO}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#fff';
  for (let i = 0; i < RAMP.length; i++) {
    ctx.fillText(RAMP[i]!, i * CELL_W + CELL_W / 2, CELL_H / 2 + 0.5);
  }
  return atlas;
}

/** Sets up both passes on a canvas, or returns null if WebGL is unavailable. */
function createRenderer(canvas: HTMLCanvasElement, scale: number) {
  const gl = canvas.getContext('webgl', { antialias: false });
  if (!gl) return null;
  const scene = program(gl, SCENE_FRAGMENT);
  const post = program(gl, POST_FRAGMENT);
  if (!scene || !post) return null;

  // One triangle that covers the whole viewport, shared by both passes.
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const select = (p: WebGLProgram) => {
    gl.useProgram(p);
    const position = gl.getAttribLocation(p, 'aPosition');
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
  };
  const at = (p: WebGLProgram, name: string) => gl.getUniformLocation(p, name);

  const sceneTex = texture(gl, gl.LINEAR);
  const framebuffer = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, sceneTex, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);

  const atlasTex = texture(gl, gl.LINEAR);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, glyphAtlas(scale));

  let sceneW = 1;
  let sceneH = 1;
  return {
    resize(cssW: number, cssH: number) {
      sceneW = Math.max(1, Math.round(cssW * SCENE_SCALE));
      sceneH = Math.max(1, Math.round(cssH * SCENE_SCALE));
      gl.bindTexture(gl.TEXTURE_2D, sceneTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, sceneW, sceneH, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    },
    draw(
      time: number,
      intro: number,
      pointer: [number, number],
      rects: Float32Array,
      kinds: Float32Array,
    ) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.viewport(0, 0, sceneW, sceneH);
      select(scene);
      gl.uniform2f(at(scene, 'uRes'), sceneW, sceneH);
      gl.uniform1f(at(scene, 'uTime'), time);
      gl.uniform2f(at(scene, 'uPointer'), pointer[0], pointer[1]);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, canvas.width, canvas.height);
      select(post);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, sceneTex);
      gl.uniform1i(at(post, 'uScene'), 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, atlasTex);
      gl.uniform1i(at(post, 'uAtlas'), 1);
      gl.uniform1f(at(post, 'uGlyphs'), RAMP.length);
      gl.uniform2f(at(post, 'uRes'), canvas.width, canvas.height);
      gl.uniform1f(at(post, 'uTime'), time);
      gl.uniform2f(at(post, 'uCell'), CELL_W * scale, CELL_H * scale);
      gl.uniform4fv(at(post, 'uWin'), rects);
      gl.uniform1fv(at(post, 'uWinKind'), kinds);
      gl.uniform1f(at(post, 'uIntro'), intro);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
  };
}

/**
 * The welcome page's left panel: a grainy, out-of-focus dusk painted by a shader. Every few
 * seconds the picture glitches into pixel-sort smears and ASCII made from the image itself, a
 * line of live hotel data scrolls in, and the pointer is a lens that turns the sky into
 * characters. One still frame with reduced motion; a plain gradient without WebGL.
 */
export function WelcomeScene({ data, caption }: WelcomeSceneProps) {
  const container = useRef<HTMLDivElement>(null);
  const glCanvas = useRef<HTMLCanvasElement>(null);
  const textCanvas = useRef<HTMLCanvasElement>(null);
  const lines = useRef(data);
  // The animation reads the latest data without restarting.
  useEffect(() => {
    lines.current = data;
  }, [data]);

  useEffect(() => {
    const box = container.current;
    const canvas = glCanvas.current;
    const text = textCanvas.current;
    const ctx = text?.getContext('2d');
    if (!box || !canvas || !text || !ctx) return;
    // The post pass runs on every pixel each frame, so its density is capped.
    const glScale = Math.min(window.devicePixelRatio || 1, 1.5);
    const textScale = Math.min(window.devicePixelRatio || 1, 2);
    const renderer = createRenderer(canvas, glScale);
    if (!renderer) canvas.style.display = 'none';
    const glyphColor = getComputedStyle(box).getPropertyValue('--scene-glyph').trim() || '#fff';
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const rects = new Float32Array(MAX_WINDOWS * 4);
    const kinds = new Float32Array(MAX_WINDOWS);
    let width = 0;
    let height = 0;
    let raf = 0;
    let last = 0;
    const start = performance.now();
    const pointer: [number, number] = [0, 0];
    let target: [number, number] = [0, 0];
    let lens: Cell | null = null;

    function resize() {
      width = box!.clientWidth;
      height = box!.clientHeight;
      canvas!.width = Math.max(1, Math.round(width * glScale));
      canvas!.height = Math.max(1, Math.round(height * glScale));
      text!.width = Math.round(width * textScale);
      text!.height = Math.round(height * textScale);
      renderer?.resize(width, height);
    }

    function draw(t: number, elapsed = 99) {
      pointer[0] += (target[0] - pointer[0]) * 0.06;
      pointer[1] += (target[1] - pointer[1]) * 0.06;
      const grid = { cols: Math.floor(width / CELL_W), rows: Math.floor(height / CELL_H) };
      const data = lines.current;
      const windows = windowsAt(
        t,
        grid,
        data.map((l) => l.length),
        lens,
      );

      // Windows in the shader's pixels, y up.
      rects.fill(0);
      kinds.fill(0);
      windows.forEach((w, i) => {
        const top = canvas!.height - w.row * CELL_H * glScale;
        rects.set(
          [
            w.col * CELL_W * glScale,
            top - w.rows * CELL_H * glScale,
            (w.col + w.cols) * CELL_W * glScale,
            top,
          ],
          i * 4,
        );
        kinds[i] = KIND_CODE[w.kind];
      });
      // The intro resolves from ASCII into the picture over the first 1.8 seconds.
      const intro = Math.max(0, 1 - elapsed / 1.8) ** 1.6;
      renderer?.draw(t, intro, pointer, rects, kinds);

      // The data line, crisp on its dark smear, with a blinking cursor.
      ctx!.setTransform(textScale, 0, 0, textScale, 0, 0);
      ctx!.clearRect(0, 0, width, height);
      ctx!.font = `600 13px ${MONO}`;
      ctx!.textBaseline = 'middle';
      ctx!.fillStyle = glyphColor;
      for (const w of windows) {
        if (w.kind !== 'data' || w.data === null) continue;
        const line = data[w.data] ?? '';
        const y = w.row * CELL_H + CELL_H / 2 + 0.5;
        // Typed out over the first half second.
        const shown = line.slice(0, Math.ceil(((t % 5.2) / 0.5) * line.length));
        for (let i = 0; i < shown.length; i++) {
          ctx!.fillText(shown[i]!, (w.col + 1 + i) * CELL_W + 1, y);
        }
        if (Math.floor(t * 2) % 2 === 0) {
          ctx!.fillRect((w.col + 1 + shown.length) * CELL_W + 1, y - 6, 7, 12);
        }
      }
    }

    function loop(now: number) {
      raf = requestAnimationFrame(loop);
      if (now - last < FRAME_MS) return;
      last = now;
      const elapsed = (now - start) / 1000;
      draw(elapsed + 2, elapsed);
    }

    function onPointer(e: PointerEvent) {
      const rect = box!.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      target = [(x / rect.width) * 2 - 1, 1 - (y / rect.height) * 2];
      lens = { col: Math.floor(x / CELL_W), row: Math.floor(y / CELL_H) };
      if (still) draw(7);
    }
    function onLeave() {
      target = [0, 0];
      lens = null;
      if (still) draw(7);
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
      className="relative h-full w-full cursor-crosshair overflow-hidden"
      style={{
        background:
          'linear-gradient(to bottom, var(--scene-sky) 0%, var(--scene-haze) 55%, var(--scene-ground) 100%)',
      }}
    >
      <canvas ref={glCanvas} className="absolute inset-0 h-full w-full" />
      <canvas ref={textCanvas} className="absolute inset-0 h-full w-full" />
      <p className="absolute bottom-6 left-6 font-mono text-[11px] tracking-wider text-scene-glyph/70 uppercase sm:bottom-8 sm:left-8">
        {caption}
      </p>
    </div>
  );
}
