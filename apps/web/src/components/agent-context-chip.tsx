import type { AgentContext } from '@orbit/shared';
import { Inbox, X } from 'lucide-react';
import { GuestAvatar } from '@/components/guest-avatar';
import { useBookingDetail, useGuest, useInquiry } from '@/lib/api';
import { cn } from '@/lib/utils';

/** "Grace Lane · 210": who or what a context is about, read from hotel data. */
function useContextLabel(context: AgentContext): { name: string | null; detail: string | null } {
  const booking = useBookingDetail(context.kind === 'booking' ? context.id : null).data;
  const guest = useGuest(context.kind === 'guest' ? context.id : '').data;
  const inquiry = useInquiry(context.kind === 'inquiry' ? context.id : undefined).data;
  switch (context.kind) {
    case 'booking':
      return { name: booking?.guest.name ?? null, detail: booking ? booking.room.name : null };
    case 'guest':
      return { name: guest?.name ?? null, detail: 'Guest' };
    case 'inquiry':
      return { name: inquiry?.senderName ?? inquiry?.senderAddress ?? null, detail: 'Inbox' };
  }
}

/**
 * What a question is about, as a small chip: in the input before it is sent (with a button to
 * leave it out) and above the question once it is.
 */
export function AgentContextChip({
  context,
  onRemove,
  className,
}: {
  context: AgentContext;
  onRemove?: () => void;
  className?: string;
}) {
  const { name, detail } = useContextLabel(context);
  return (
    <span
      className={cn(
        'inline-flex h-6 max-w-64 shrink-0 items-center gap-1.5 rounded-full bg-ink/5 py-0 pl-0.5 text-xs text-foreground',
        onRemove ? 'pr-0.5' : 'pr-2',
        className,
      )}
    >
      {context.kind === 'inquiry' ? (
        <span className="grid size-5 place-items-center rounded-full bg-background">
          <Inbox className="size-3 text-muted-foreground" />
        </span>
      ) : (
        <GuestAvatar name={name ?? '?'} className="size-5 text-[8px]" />
      )}
      <span className="truncate">{name ?? '…'}</span>
      {detail && <span className="shrink-0 font-mono text-muted-foreground">{detail}</span>}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label="Ask without this context"
          className="grid size-5 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-ink/8 hover:text-foreground"
        >
          <X className="size-3" />
        </button>
      )}
    </span>
  );
}
