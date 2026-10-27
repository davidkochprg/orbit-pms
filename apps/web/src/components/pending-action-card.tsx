import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { useBookingDrawer } from '@/hooks/use-booking-drawer';
import { usePendingAction, useResolvePendingAction } from '@/lib/api';

const statusText = {
  confirmed: 'Done',
  rejected: 'Rejected',
  failed: 'Could not be applied',
} as const;

/** Confirm card for a change the agent proposed. Nothing happens until the user confirms. */
export function PendingActionCard({ id, summary }: { id: string; summary: string }) {
  const action = usePendingAction(id);
  const resolve = useResolvePendingAction(id);
  const { open } = useBookingDrawer();
  const current = resolve.data ?? action.data;

  return (
    <Card className="gap-2 py-3">
      <CardContent className="px-3 text-sm">{current?.summary ?? summary}</CardContent>
      <CardFooter className="flex flex-wrap items-center gap-2 px-3">
        {current?.status === 'pending' ? (
          <>
            <Button
              size="sm"
              disabled={resolve.isPending}
              onClick={() => resolve.mutate('confirm')}
            >
              Confirm
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={resolve.isPending}
              onClick={() => resolve.mutate('reject')}
            >
              Reject
            </Button>
          </>
        ) : current ? (
          <span className="text-xs text-muted-foreground">
            {statusText[current.status]}
            {current.error && `: ${current.error}`}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">Loading…</span>
        )}
        {current?.bookingId && current.status === 'confirmed' && (
          <Button size="sm" variant="ghost" onClick={() => open(current.bookingId!)}>
            Open booking
          </Button>
        )}
      </CardFooter>
      {resolve.isError && <p className="px-3 text-xs text-destructive">{resolve.error.message}</p>}
    </Card>
  );
}
