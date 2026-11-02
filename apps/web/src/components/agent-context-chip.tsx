import type { AgentContext } from '@orbit/shared';
import {
  BookOpenText,
  CalendarRange,
  ChartColumn,
  Contact,
  DoorOpen,
  Inbox,
  type LucideIcon,
  Tags,
  Wrench,
  X,
} from 'lucide-react';
import { GuestAvatar } from '@/components/guest-avatar';
import {
  useBookingDetail,
  useContacts,
  useGuest,
  useHotelInfo,
  useInquiry,
  useRepair,
  useRooms,
} from '@/lib/api';
import { parseRangeId } from '@/lib/agent-context';
import { formatDate, formatRange } from '@/lib/format';
import { cn } from '@/lib/utils';

/** Contexts shown with an icon; a booking or guest shows the person's orb. */
const kindIcons: Partial<Record<AgentContext['kind'], LucideIcon>> = {
  inquiry: Inbox,
  room: DoorOpen,
  repair: Wrench,
  contact: Contact,
  note: BookOpenText,
  night: Tags,
  tape_chart: CalendarRange,
  report: ChartColumn,
};

/** "Grace Lane · 210": who or what a context is about, read from hotel data. */
function useContextLabel(context: AgentContext): { name: string | null; detail: string | null } {
  const { kind, id } = context;
  const booking = useBookingDetail(kind === 'booking' ? id : null).data;
  const guest = useGuest(kind === 'guest' ? id : '').data;
  const inquiry = useInquiry(kind === 'inquiry' ? id : undefined).data;
  const repair = useRepair(kind === 'repair' ? id : null).data;
  const rooms = useRooms().data;
  const contacts = useContacts().data;
  const notes = useHotelInfo().data;
  const range = parseRangeId(id);
  switch (kind) {
    case 'booking':
      return { name: booking?.guest.name ?? null, detail: booking ? booking.room.name : null };
    case 'guest':
      return { name: guest?.name ?? null, detail: 'Guest' };
    case 'inquiry':
      return { name: inquiry?.senderName ?? inquiry?.senderAddress ?? null, detail: 'Inbox' };
    case 'room':
      return { name: 'Room', detail: rooms?.find((r) => r.id === id)?.name ?? null };
    case 'repair':
      return {
        name: repair ? (repair.task.notes ?? 'Repair') : null,
        detail: repair?.roomName ?? null,
      };
    case 'contact':
      return { name: contacts?.find((c) => c.id === id)?.name ?? null, detail: null };
    case 'note':
      return { name: notes?.find((n) => n.id === id)?.title ?? null, detail: null };
    case 'night':
      return { name: formatDate(id), detail: null };
    case 'tape_chart':
    case 'report':
      return { name: range ? formatRange(range.from, range.to) : null, detail: null };
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
  const Icon = kindIcons[context.kind];
  return (
    <span
      className={cn(
        'inline-flex h-6 max-w-64 shrink-0 items-center gap-1.5 rounded-full bg-ink/5 py-0 pl-0.5 text-xs text-foreground',
        onRemove ? 'pr-0.5' : 'pr-2',
        className,
      )}
    >
      {Icon ? (
        <span className="grid size-5 shrink-0 place-items-center rounded-full bg-background">
          <Icon className="size-3 text-muted-foreground" />
        </span>
      ) : (
        <GuestAvatar name={name ?? '?'} className="size-5 text-[0.5rem]" />
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
