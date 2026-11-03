import type { ReactNode } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

/**
 * A document beside what is known about it: the pages on the left, the details and actions in a
 * column on the right. Without pages the dialog is just the column, at form width.
 */
export function DocumentDialog({
  open,
  onClose,
  pages,
  children,
}: {
  open: boolean;
  onClose: () => void;
  pages: ReactNode | null;
  children: ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        aria-describedby={undefined}
        className={cn(
          'max-h-[calc(100dvh-2rem)] shadow-floating',
          pages
            ? 'flex h-[min(56rem,calc(100dvh-2rem))] flex-col gap-0 overflow-y-auto p-0 sm:max-w-6xl md:grid md:grid-cols-[minmax(0,1fr)_23rem] md:overflow-hidden'
            : 'overflow-y-auto sm:max-w-lg',
        )}
      >
        {pages && (
          <div className="flex min-h-0 flex-col max-md:order-last max-md:h-[70vh] md:overflow-hidden md:rounded-l-card">
            {pages}
          </div>
        )}
        {pages ? (
          <div className="flex min-h-0 flex-col gap-4 p-5 md:overflow-y-auto">{children}</div>
        ) : (
          children
        )}
      </DialogContent>
    </Dialog>
  );
}

/** A document's details as label and value rows. */
export function DocumentFacts({
  facts,
  className,
}: {
  facts: ({ label: string; value: ReactNode; mono?: boolean } | null | false)[];
  className?: string;
}) {
  return (
    <dl className={cn('grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-sm', className)}>
      {facts
        .filter((f) => !!f)
        .map((f) => (
          <div key={f.label} className="contents">
            <dt className="text-muted-foreground">{f.label}</dt>
            <dd
              className={cn(
                'min-w-0 text-right break-words',
                f.mono && 'font-mono text-[0.8125rem]',
              )}
            >
              {f.value}
            </dd>
          </div>
        ))}
    </dl>
  );
}
