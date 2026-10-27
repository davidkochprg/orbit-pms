import type { BookingStatus } from '@orbit/shared';
import { StatusDot } from '@/components/status-dot';
import { statusLabels } from '@/lib/format';
import { bookingStatusColor } from '@/lib/status';
import { cn } from '@/lib/utils';

export function BookingStatusBadge({
  status,
  className,
}: {
  status: BookingStatus;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex h-5 shrink-0 items-center gap-1.5 rounded-full border px-2 text-xs font-medium text-muted-foreground',
        className,
      )}
    >
      <StatusDot className={cn('size-1.5', bookingStatusColor[status])} />
      {statusLabels[status]}
    </span>
  );
}
