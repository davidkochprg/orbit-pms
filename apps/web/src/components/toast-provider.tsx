import { X } from 'lucide-react';
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ToastContext, type ToastOptions } from '@/hooks/use-toast';

/** How long a toast stays, long enough to reach Undo. */
const SHOW_MS = 6000;

interface Shown extends ToastOptions {
  id: number;
}

/**
 * Short confirmations of changes that happen without a dialog, such as a room marked clean, each
 * with an optional Undo. One at a time: a new one replaces the last.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [shown, setShown] = useState<Shown | null>(null);
  const next = useRef(0);

  const toast = useCallback((options: ToastOptions) => {
    next.current += 1;
    setShown({ ...options, id: next.current });
  }, []);

  useEffect(() => {
    if (!shown) return;
    const timer = window.setTimeout(() => setShown(null), SHOW_MS);
    return () => window.clearTimeout(timer);
  }, [shown]);

  const value = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext value={value}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-4"
      >
        {shown && (
          <div
            key={shown.id}
            role="status"
            className="pointer-events-auto flex max-w-md items-center gap-3 rounded-control bg-popover py-2 pr-2 pl-4 text-sm shadow-floating backdrop-blur-2xl stroke-lit animate-in fade-in slide-in-from-bottom-2"
          >
            <span className="min-w-0 flex-1 truncate">{shown.title}</span>
            {shown.action && (
              <Button
                variant="outline"
                size="xs"
                onClick={() => {
                  shown.action?.run();
                  setShown(null);
                }}
              >
                {shown.action.label}
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Dismiss"
              onClick={() => setShown(null)}
            >
              <X />
            </Button>
          </div>
        )}
      </div>
    </ToastContext>
  );
}
