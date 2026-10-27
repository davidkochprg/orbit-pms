import type { BookingStatus } from '@orbit/shared';
import { Badge } from '@/components/ui/badge';
import { statusLabels } from '@/lib/format';

const variants: Record<BookingStatus, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  hold: 'outline',
  confirmed: 'secondary',
  checked_in: 'default',
  checked_out: 'outline',
  cancelled: 'destructive',
};

export function BookingStatusBadge({ status }: { status: BookingStatus }) {
  return <Badge variant={variants[status]}>{statusLabels[status]}</Badge>;
}
