import { CircleAlert, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/** An inline error with an optional dismiss button. */
export function ErrorNotice({
  message,
  onDismiss,
  className,
}: {
  message: string;
  onDismiss?: () => void;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn(
        'flex items-center gap-2 rounded-lg border border-destructive/25 bg-destructive/5 px-3 py-2 text-sm text-destructive',
        className,
      )}
    >
      <CircleAlert className="size-4 shrink-0" />
      <span className="min-w-0 flex-1">{message}</span>
      {onDismiss && (
        <Button variant="ghost" size="icon-xs" aria-label="Dismiss" onClick={onDismiss}>
          <X />
        </Button>
      )}
    </div>
  );
}
