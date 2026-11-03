import { Download } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy } from 'unpdf/pdfjs';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

/** The most pages drawn: invoices and bills run to a page or two. */
const MAX_PAGES = 10;

interface DocumentPagesProps {
  /** Where the file is served. */
  url: string;
  contentType: string;
  name: string;
  /** A link that saves the file, offered if it can't be drawn. */
  downloadUrl?: string;
  className?: string;
}

/**
 * A PDF or photo drawn as paper on the page, not in the browser's PDF viewer: each page fits the
 * column's width and the column scrolls. PDF.js loads only once a PDF is opened.
 */
export function DocumentPages({
  url,
  contentType,
  name,
  downloadUrl,
  className,
}: DocumentPagesProps) {
  return (
    <div
      className={cn(
        'scroll-fade min-h-0 overflow-y-auto bg-surface-sunken p-4 ring-1 ring-ink/5 ring-inset sm:p-6',
        className,
      )}
    >
      {contentType === 'application/pdf' ? (
        // A new file starts over: no pages of the last one while it loads.
        <PdfPages key={url} url={url} name={name} downloadUrl={downloadUrl ?? url} />
      ) : (
        <img src={url} alt={name} className="mx-auto w-full max-w-3xl bg-white shadow-card" />
      )}
    </div>
  );
}

function PdfPages({ url, name, downloadUrl }: { url: string; name: string; downloadUrl: string }) {
  const box = useRef<HTMLDivElement>(null);
  const width = useSettledWidth(box);
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let loaded: PDFDocumentProxy | null = null;
    void (async () => {
      try {
        const [{ getDocumentProxy }, res] = await Promise.all([import('unpdf'), fetch(url)]);
        if (!res.ok) throw new Error(`The file couldn't be loaded (${res.status})`);
        loaded = await getDocumentProxy(new Uint8Array(await res.arrayBuffer()));
        if (!cancelled) setDoc(loaded);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
      void loaded?.cleanup();
    };
  }, [url]);

  const count = doc ? Math.min(doc.numPages, MAX_PAGES) : 0;
  return (
    <div ref={box} className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      {failed ? (
        <div className="flex flex-col items-center gap-3 py-16 text-sm text-muted-foreground">
          This file couldn't be shown here.
          <Button variant="outline" size="sm" asChild>
            <a href={downloadUrl} download={name}>
              <Download /> Download
            </a>
          </Button>
        </div>
      ) : doc && width > 0 ? (
        Array.from({ length: count }, (_, i) => (
          <PdfPage
            key={i}
            doc={doc}
            number={i + 1}
            width={width}
            label={count > 1 ? `${name}, page ${i + 1}` : name}
            onFail={setFailed}
          />
        ))
      ) : (
        <Skeleton className="aspect-[210/297] w-full rounded-none" />
      )}
    </div>
  );
}

/** One page, drawn at the column's width in device pixels so the text stays sharp. */
function PdfPage({
  doc,
  number,
  width,
  label,
  onFail,
}: {
  doc: PDFDocumentProxy;
  number: number;
  width: number;
  label: string;
  onFail: (failed: true) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [aspect, setAspect] = useState(297 / 210);
  useEffect(() => {
    let task: { cancel: () => void } | null = null;
    let cancelled = false;
    void (async () => {
      try {
        const page = await doc.getPage(number);
        const el = canvas.current;
        if (cancelled || !el) return;
        const base = page.getViewport({ scale: 1 });
        const ratio = Math.min(window.devicePixelRatio || 1, 2);
        const viewport = page.getViewport({ scale: (width / base.width) * ratio });
        el.width = Math.floor(viewport.width);
        el.height = Math.floor(viewport.height);
        setAspect(base.height / base.width);
        const render = page.render({ canvas: el, viewport });
        task = render;
        await render.promise;
      } catch (e) {
        // A redraw cancels the one before it; only a real failure counts.
        if (!cancelled && !(e instanceof Error && e.name === 'RenderingCancelledException')) {
          onFail(true);
        }
      }
    })();
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [doc, number, width, onFail]);
  return (
    <canvas
      ref={canvas}
      role="img"
      aria-label={label}
      style={{ aspectRatio: `1 / ${aspect}` }}
      className="block h-auto w-full bg-white shadow-card"
    />
  );
}

/** An element's width, updated once a resize settles rather than on every pixel of it. */
function useSettledWidth(ref: React.RefObject<HTMLElement | null>): number {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let first = true;
    const observer = new ResizeObserver(([entry]) => {
      const next = Math.round(entry?.contentRect.width ?? 0);
      clearTimeout(timer);
      // The first measure is immediate; later ones wait, and ignore a few pixels of change.
      timer = setTimeout(
        () => setWidth((w) => (w === 0 || Math.abs(w - next) > 8 ? next : w)),
        first ? 0 : 150,
      );
      first = false;
    });
    observer.observe(el);
    return () => {
      clearTimeout(timer);
      observer.disconnect();
    };
  }, [ref]);
  return width;
}
