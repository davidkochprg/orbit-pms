import {
  folioSchema,
  quoteAddonsSchema,
  quoteSchema,
  roomOptionSchema,
  type Folio,
  type Quote,
  type QuoteAddons,
  type RoomOption,
} from '@orbit/shared';
import { Calculator, CalendarSearch, ChevronRight, Receipt } from 'lucide-react';
import { useState } from 'react';
import { AgentCard, AgentCardHeader, Amounts } from '@/components/agent-card';
import { Mention, RoomBadge } from '@/components/agent-mention';
import { Button } from '@/components/ui/button';
import { useBookingDrawer } from '@/hooks/use-booking-drawer';
import { useBookingEditor } from '@/hooks/use-booking-editor';
import { useCommandPalette } from '@/hooks/use-command-palette';
import { useRoomTypes } from '@/lib/api';
import { formatMoney, formatParty, formatRange } from '@/lib/format';
import { cn } from '@/lib/utils';

/** A finished tool step: what the agent asked for and what came back. */
export interface ToolResult {
  id: string;
  name: string;
  input: unknown;
  output: unknown;
}

/**
 * Free rooms, prices and bills straight from the tools, so the amounts are exactly what the domain
 * worked out: one card per availability check and per quote asked for, and the latest bill of
 * each booking.
 */
export function ResultCards({ results }: { results: ToolResult[] }) {
  const searches: { key: string; options: RoomOption[]; addons: QuoteAddons }[] = [];
  const quotes: { key: string; quote: Quote; roomId: string | null }[] = [];
  const bills = new Map<string, Folio>();
  for (const { id, name, input, output } of results) {
    if (name === 'checkAvailability') {
      const parsed = roomOptionSchema.array().safeParse(output);
      const addons = quoteAddonsSchema.safeParse(
        (input as { addons?: unknown } | undefined)?.addons ?? {},
      );
      if (parsed.success && parsed.data.length > 0) {
        searches.push({
          key: id,
          options: parsed.data,
          addons: addons.success ? addons.data : quoteAddonsSchema.parse({}),
        });
      }
    }
    if (name === 'quote') {
      const parsed = quoteSchema.safeParse(output);
      const roomId = (input as { roomId?: string } | undefined)?.roomId ?? null;
      if (parsed.success) quotes.push({ key: id, quote: parsed.data, roomId });
    }
    if (name === 'getBill') {
      const parsed = folioSchema.safeParse(output);
      if (parsed.success) bills.set(parsed.data.bookingId, parsed.data);
    }
  }
  if (searches.length === 0 && quotes.length === 0 && bills.size === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      {searches.map((s) => (
        <AvailabilityCard key={s.key} options={s.options} addons={s.addons} />
      ))}
      {quotes.map((q) => (
        <QuoteCard key={q.key} quote={q.quote} roomId={q.roomId} />
      ))}
      {[...bills.values()].map((folio) => (
        <BillCard key={folio.bookingId} folio={folio} />
      ))}
    </div>
  );
}

function QuoteCard({ quote, roomId }: { quote: Quote; roomId: string | null }) {
  const roomTypes = useRoomTypes().data;
  const typeName = roomTypes?.find((t) => t.id === quote.roomTypeId)?.name;
  return (
    <AgentCard>
      <AgentCardHeader
        icon={Calculator}
        title={
          <>
            {roomId ? <Mention id={roomId} /> : (typeName ?? 'Price')}
            <span className="truncate text-xs font-normal text-muted-foreground">
              {formatRange(quote.checkIn, quote.checkOut)} ·{' '}
              {formatParty(quote.adults, quote.childAges)}
            </span>
          </>
        }
        aside={
          <span className="shrink-0 font-mono text-base tabular-nums">
            {formatMoney(quote.total)}
          </span>
        }
      />
      <Amounts lines={quote.lines} />
    </AgentCard>
  );
}

function BillCard({ folio }: { folio: Folio }) {
  const { open } = useBookingDrawer();
  const { closePalette } = useCommandPalette();
  const extras = folio.lines.filter((l) => l.kind === 'extra');
  return (
    <AgentCard>
      <AgentCardHeader
        icon={Receipt}
        title={<Mention id={folio.bookingId} />}
        aside={
          <span
            className={cn(
              'shrink-0 font-mono text-base tabular-nums',
              folio.balance > 0
                ? 'text-warning'
                : folio.balance < 0
                  ? 'text-primary-text'
                  : 'text-success',
            )}
          >
            {folio.balance > 0
              ? `${formatMoney(folio.balance)} due`
              : folio.balance < 0
                ? `${formatMoney(-folio.balance)} owed back`
                : 'Paid in full'}
          </span>
        }
      />
      <Amounts
        lines={[
          { label: 'Charged', amount: folio.charged },
          ...extras.map((l) => ({
            label: l.quantity > 1 ? `${l.label} × ${l.quantity}` : l.label,
            amount: l.amount,
          })),
          { label: 'Paid', amount: folio.paid },
        ]}
      />
      <Button
        variant="ghost"
        size="xs"
        className="self-start"
        onClick={() => {
          closePalette();
          open(folio.bookingId);
        }}
      >
        Open booking
      </Button>
    </AgentCard>
  );
}

/** How many free rooms show before "Show all". */
const AVAILABILITY_ROWS = 4;

/**
 * The rooms free for a stay, cheapest first, each with its total. A row opens into the line items;
 * Hold opens a new booking for that room with the stay already filled in.
 */
function AvailabilityCard({ options, addons }: { options: RoomOption[]; addons: QuoteAddons }) {
  const [all, setAll] = useState(false);
  const [openRoom, setOpenRoom] = useState<string | null>(null);
  const { openNew } = useBookingEditor();
  const { closePalette } = useCommandPalette();
  const { quote: stay } = options[0]!;
  const shown = all ? options : options.slice(0, AVAILABILITY_ROWS);

  return (
    <AgentCard>
      <AgentCardHeader
        icon={CalendarSearch}
        title={options.length === 1 ? '1 room free' : `${options.length} rooms free`}
        aside={
          <span className="truncate text-xs text-muted-foreground">
            {formatRange(stay.checkIn, stay.checkOut)} · {formatParty(stay.adults, stay.childAges)}
          </span>
        }
      />
      <ul className="-mx-1.5 flex flex-col">
        {shown.map((o) => {
          const open = openRoom === o.roomId;
          return (
            <li key={o.roomId} className="flex flex-col">
              <div className="flex items-center gap-1 rounded-control pr-1 transition-colors hover:bg-accent">
                <button
                  type="button"
                  onClick={() => setOpenRoom(open ? null : o.roomId)}
                  aria-expanded={open}
                  className="flex min-w-0 flex-1 items-center gap-2.5 rounded-control py-1.5 pl-1.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <RoomBadge name={o.roomName} />
                  <span className="min-w-0 flex-1 truncate text-muted-foreground">
                    {o.roomType.name}
                  </span>
                  <span className="shrink-0 font-mono tabular-nums">
                    {formatMoney(o.quote.total)}
                  </span>
                  <ChevronRight
                    className={cn(
                      'size-3.5 shrink-0 text-subtle-foreground transition-transform',
                      open && 'rotate-90',
                    )}
                  />
                </button>
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => {
                    closePalette();
                    openNew({
                      roomId: o.roomId,
                      checkIn: o.quote.checkIn,
                      checkOut: o.quote.checkOut,
                      adults: o.quote.adults,
                      childAges: o.quote.childAges,
                      addons,
                    });
                  }}
                >
                  Hold
                </Button>
              </div>
              {open && (
                <div className="px-1.5 pt-1 pb-2">
                  <Amounts lines={o.quote.lines} />
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {options.length > AVAILABILITY_ROWS && (
        <Button variant="ghost" size="xs" className="self-start" onClick={() => setAll((a) => !a)}>
          {all ? 'Show fewer' : `Show all ${options.length}`}
        </Button>
      )}
    </AgentCard>
  );
}
