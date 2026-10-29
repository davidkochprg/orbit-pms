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
import { getToolName, isToolUIPart, type UIMessage } from 'ai';
import {
  BedDouble,
  BookOpen,
  Braces,
  BrushCleaning,
  Calculator,
  CalendarSearch,
  ChartColumn,
  ChevronRight,
  CircleAlert,
  DoorOpen,
  FilePen,
  IdCard,
  LogIn,
  LogOut,
  type LucideIcon,
  Receipt,
  Search,
  Sun,
  Wrench,
} from 'lucide-react';
import { type ReactNode, useMemo, useState } from 'react';
import { ThinkingOrb } from 'thinking-orbs';
import { BookingRow, Mention, RoomBadge } from '@/components/agent-mention';
import { PendingActionCard } from '@/components/pending-action-card';
import { Button } from '@/components/ui/button';
import { AgentEntitiesContext } from '@/hooks/use-agent-entities';
import { useBookingDrawer } from '@/hooks/use-booking-drawer';
import { useBookingEditor } from '@/hooks/use-booking-editor';
import { useCommandPalette } from '@/hooks/use-command-palette';
import {
  asProposal,
  asToolError,
  type AgentOrbState,
  orbStateFor,
  toolLabel,
  toolResultSummary,
} from '@/lib/agent';
import { collectEntities, type Inline, parseAnswer } from '@/lib/agent-answer';
import { useRoomTypes } from '@/lib/api';
import { formatMoney, formatParty, formatRange } from '@/lib/format';
import { cn } from '@/lib/utils';

type ToolPart = Extract<UIMessage['parts'][number], { toolCallId: string }>;

const toolIcons: Record<string, LucideIcon> = {
  listRooms: DoorOpen,
  searchBookings: Search,
  getBooking: BookOpen,
  checkAvailability: CalendarSearch,
  quote: Calculator,
  getArrivals: LogIn,
  getDepartures: LogOut,
  getDailyBrief: Sun,
  getReport: ChartColumn,
  getBill: Receipt,
  addCharge: Receipt,
  updateCharge: Receipt,
  removeCharge: Receipt,
  recordPayment: Receipt,
  getGuestBook: IdCard,
  addToGuestBook: IdCard,
  updateGuestBook: IdCard,
  removeFromGuestBook: IdCard,
  getHousekeeping: BrushCleaning,
  setRoomStatus: BrushCleaning,
  createHousekeepingTask: Wrench,
  setTaskStatus: Wrench,
  checkIn: LogIn,
  checkOut: LogOut,
  moveBooking: BedDouble,
};

const isDone = (p: ToolPart) => p.state === 'output-available' || p.state === 'output-error';
const outputOf = (p: ToolPart) => (p.state === 'output-available' ? p.output : undefined);

/**
 * The conversation: each question as a heading, then what the agent did (one line, opening into
 * the steps) and its answer, where the bookings, rooms and guests it names are chips and rows
 * that open them. Free rooms, quotes and bills it fetched show as cards; changes it proposed as
 * confirm cards.
 */
export function AgentThread({
  messages,
  status,
}: {
  messages: UIMessage[];
  status: 'submitted' | 'streaming' | 'ready' | 'error';
}) {
  const entities = useMemo(
    () =>
      collectEntities(
        messages.flatMap((m) => m.parts.filter(isToolUIPart).map((p) => outputOf(p) ?? null)),
      ),
    [messages],
  );
  const last = messages.at(-1);
  const waiting = status === 'submitted' && last?.role === 'user';

  return (
    <AgentEntitiesContext value={entities}>
      <div className="flex flex-col gap-6">
        {messages.map((m) =>
          m.role === 'user' ? (
            <p key={m.id} className="text-base font-medium tracking-tight">
              {m.parts.map((p) => (p.type === 'text' ? p.text : '')).join('')}
            </p>
          ) : (
            <AssistantMessage
              key={m.id}
              message={m}
              working={m === last && (status === 'streaming' || status === 'submitted')}
            />
          ),
        )}
        {waiting && (
          <div className="-mt-3">
            <WorkingLine state="working" label="Thinking" note={null} steps={0} />
          </div>
        )}
      </div>
    </AgentEntitiesContext>
  );
}

function AssistantMessage({ message, working }: { message: UIMessage; working: boolean }) {
  const tools = message.parts.filter(isToolUIPart) as ToolPart[];
  // Text before the last tool step is the agent narrating its progress; only the rest is the answer.
  const lastTool = message.parts.findLastIndex((p) => isToolUIPart(p));
  const narration = message.parts
    .slice(0, Math.max(lastTool, 0))
    .flatMap((p) => (p.type === 'text' && p.text.trim() ? [p.text.trim()] : []));
  const answer = message.parts
    .slice(lastTool + 1)
    .map((p) => (p.type === 'text' ? p.text : ''))
    .join('');
  const proposals = tools.flatMap((p) => {
    const proposal = asProposal(outputOf(p));
    return proposal ? [proposal] : [];
  });

  let live: ReactNode = null;
  if (working) {
    const running = tools.find((p) => !isDone(p));
    live = running ? (
      <WorkingLine
        state={orbStateFor(getToolName(running))}
        label={toolLabel(getToolName(running), false)}
        note={narration.at(-1) ?? null}
        steps={tools.length}
      />
    ) : answer.trim() ? null : (
      <WorkingLine
        state="working"
        label="Thinking"
        note={narration.at(-1) ?? null}
        steps={tools.length}
      />
    );
  }

  return (
    <div className="-mt-3 flex flex-col gap-3">
      {live}
      {!live && tools.length > 0 && <StepSummary tools={tools} narration={narration} />}
      {answer.trim() && <Answer text={answer} />}
      <ResultCards tools={tools} />
      {proposals.map((p) => (
        <PendingActionCard key={p.pendingActionId} id={p.pendingActionId} summary={p.summary} />
      ))}
    </div>
  );
}

/** The orb and what the agent is doing right now. */
function WorkingLine({
  state,
  label,
  note,
  steps,
}: {
  state: AgentOrbState;
  label: string;
  note: string | null;
  steps: number;
}) {
  return (
    <div className="flex items-center gap-2.5 text-sm" role="status" aria-live="polite">
      <ThinkingOrb state={state} size={20} aria-label="Orbit is working" />
      <span className="min-w-0 truncate">
        <span className="font-medium">{label}…</span>
        {note && <span className="ml-2 text-muted-foreground">{note}</span>}
      </span>
      {steps > 1 && (
        <span className="ml-auto shrink-0 text-xs text-subtle-foreground tabular-nums">
          step {steps}
        </span>
      )}
    </div>
  );
}

/** "Checked arrivals and opened the bill", opening into a timeline of the steps. */
function StepSummary({ tools, narration }: { tools: ToolPart[]; narration: string[] }) {
  const [open, setOpen] = useState(false);
  const labels = [...new Set(tools.map((p) => toolLabel(getToolName(p), true)))];
  const failed = tools.some((p) => p.state === 'output-error' || asToolError(outputOf(p)));
  const sentence =
    labels.length === 1
      ? labels[0]
      : labels.length === 2
        ? `${labels[0]} and ${labels[1]!.toLowerCase()}`
        : `${labels[0]} and ${labels.length - 1} more steps`;
  const icons = [...new Set(tools.map((p) => toolIcons[getToolName(p)] ?? FilePen))].slice(0, 4);

  return (
    <div className="flex flex-col">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="group -mx-1.5 flex w-fit max-w-full items-center gap-2 rounded-md px-1.5 py-1 text-xs text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="flex -space-x-1">
          {icons.map((Icon, i) => (
            <span
              key={i}
              className="grid size-5 place-items-center rounded-full bg-background ring-1 ring-ink/8"
            >
              <Icon className="size-3" />
            </span>
          ))}
        </span>
        <span className="truncate">{sentence}</span>
        {failed && <CircleAlert className="size-3.5 shrink-0 text-destructive" />}
        <ChevronRight
          className={cn('size-3.5 shrink-0 transition-transform', open && 'rotate-90')}
        />
      </button>
      {open && (
        <ol className="mt-1.5 ml-[0.4rem] flex flex-col border-l border-border pl-4">
          {narration.length > 0 && (
            <li className="pb-2 text-xs text-muted-foreground italic">{narration.join(' ')}</li>
          )}
          {tools.map((p) => (
            <Step key={p.toolCallId} part={p} />
          ))}
        </ol>
      )}
    </div>
  );
}

function Step({ part }: { part: ToolPart }) {
  const [raw, setRaw] = useState(false);
  const name = getToolName(part);
  const Icon = toolIcons[name] ?? FilePen;
  const output = outputOf(part);
  const failed = part.state === 'output-error' || asToolError(output) !== null;
  const summary =
    part.state === 'output-error' ? (part.errorText ?? 'Failed') : toolResultSummary(name, output);
  return (
    <li className="relative pb-2 text-xs last:pb-0">
      <span className="absolute top-0.5 -left-[1.4rem] grid size-[0.9rem] place-items-center rounded-full bg-popover text-muted-foreground">
        <Icon className="size-3" />
      </span>
      <div className="flex items-center gap-2">
        <span className="font-medium text-foreground">{toolLabel(name, true)}</span>
        {summary && (
          <span className={cn('truncate', failed ? 'text-destructive' : 'text-muted-foreground')}>
            {summary}
          </span>
        )}
        <button
          type="button"
          onClick={() => setRaw((r) => !r)}
          aria-label={raw ? 'Hide the raw data' : 'Show the raw data'}
          aria-pressed={raw}
          className="ml-auto rounded p-0.5 text-subtle-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Braces className="size-3" />
        </button>
      </div>
      {raw && (
        <pre className="scrollbar-thin mt-1 max-h-48 overflow-auto rounded-md bg-muted p-2 text-[11px] leading-snug">
          {JSON.stringify({ input: part.input, output: output ?? part.errorText }, null, 2)}
        </pre>
      )}
    </li>
  );
}

function InlineContent({ content }: { content: Inline[] }) {
  return content.map((piece, i) =>
    piece.type === 'mention' ? (
      <Mention key={i} id={piece.id} />
    ) : piece.strong ? (
      <strong key={i} className="font-medium">
        {piece.text}
      </strong>
    ) : (
      <span key={i}>{piece.text}</span>
    ),
  );
}

/** The answer: paragraphs with chips, and lists where a booking leads its item as a row. */
function Answer({ text }: { text: string }) {
  const blocks = useMemo(() => parseAnswer(text), [text]);
  return (
    <div className="flex flex-col gap-3 leading-relaxed">
      {blocks.map((block, i) =>
        block.type === 'paragraph' ? (
          <p key={i} className="whitespace-pre-wrap">
            <InlineContent content={block.content} />
          </p>
        ) : block.items.every((item) => item.lead) ? (
          <div
            key={i}
            className="-mx-1 flex flex-col rounded-stage bg-background p-1 shadow-[0_1px_2px_var(--shadow-soft)] stroke-lit"
          >
            {block.items.map((item, j) => (
              <BookingRow key={j} id={item.lead!}>
                {item.content.length > 0 ? <InlineContent content={item.content} /> : undefined}
              </BookingRow>
            ))}
          </div>
        ) : (
          <ul key={i} className="flex flex-col gap-1.5">
            {block.items.map((item, j) => (
              <li
                key={j}
                className="relative pl-4 before:absolute before:top-[0.7em] before:left-1 before:size-1 before:rounded-full before:bg-subtle-foreground"
              >
                {item.lead && <Mention id={item.lead} />} <InlineContent content={item.content} />
              </li>
            ))}
          </ul>
        ),
      )}
    </div>
  );
}

/**
 * Free rooms, prices and bills straight from the tools, so the amounts are exactly what the domain
 * worked out: one card per availability check and per quote asked for, and the latest bill of
 * each booking.
 */
function ResultCards({ tools }: { tools: ToolPart[] }) {
  const searches: { key: string; options: RoomOption[]; addons: QuoteAddons }[] = [];
  const quotes: { key: string; quote: Quote; roomId: string | null }[] = [];
  const bills = new Map<string, Folio>();
  for (const p of tools) {
    const name = getToolName(p);
    const output = outputOf(p);
    if (name === 'checkAvailability') {
      const parsed = roomOptionSchema.array().safeParse(output);
      const addons = quoteAddonsSchema.safeParse(
        (p.input as { addons?: unknown } | undefined)?.addons ?? {},
      );
      if (parsed.success && parsed.data.length > 0) {
        searches.push({
          key: p.toolCallId,
          options: parsed.data,
          addons: addons.success ? addons.data : quoteAddonsSchema.parse({}),
        });
      }
    }
    if (name === 'quote') {
      const parsed = quoteSchema.safeParse(output);
      const input = (p.input ?? {}) as { roomId?: string };
      if (parsed.success) {
        quotes.push({ key: p.toolCallId, quote: parsed.data, roomId: input.roomId ?? null });
      }
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

function Card({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 rounded-stage bg-background p-3 text-sm shadow-[0_1px_2px_var(--shadow-soft)] stroke-lit">
      {children}
    </div>
  );
}

function Amounts({ lines }: { lines: { label: string; amount: number }[] }) {
  return (
    <ul className="flex flex-col gap-0.5 text-xs">
      {lines.map((l, i) => (
        <li key={i} className="flex items-baseline justify-between gap-4">
          <span className="min-w-0 text-muted-foreground">{l.label}</span>
          <span className="shrink-0 font-mono tabular-nums">{formatMoney(l.amount)}</span>
        </li>
      ))}
    </ul>
  );
}

function QuoteCard({ quote, roomId }: { quote: Quote; roomId: string | null }) {
  const roomTypes = useRoomTypes().data;
  const typeName = roomTypes?.find((t) => t.id === quote.roomTypeId)?.name;
  return (
    <Card>
      <div className="flex items-baseline justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2 font-medium">
          <Calculator className="size-3.5 shrink-0 text-muted-foreground" />
          {roomId ? <Mention id={roomId} /> : (typeName ?? 'Price')}
          <span className="truncate text-xs font-normal text-muted-foreground">
            {formatRange(quote.checkIn, quote.checkOut)} ·{' '}
            {formatParty(quote.adults, quote.childAges)}
          </span>
        </span>
        <span className="shrink-0 font-mono text-base tabular-nums">
          {formatMoney(quote.total)}
        </span>
      </div>
      <Amounts lines={quote.lines} />
    </Card>
  );
}

function BillCard({ folio }: { folio: Folio }) {
  const { open } = useBookingDrawer();
  const { closePalette } = useCommandPalette();
  const extras = folio.lines.filter((l) => l.kind === 'extra');
  return (
    <Card>
      <div className="flex items-center justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2 font-medium">
          <Receipt className="size-3.5 shrink-0 text-muted-foreground" />
          <Mention id={folio.bookingId} />
        </span>
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
      </div>
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
    </Card>
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
    <Card>
      <div className="flex items-baseline justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2 font-medium">
          <CalendarSearch className="size-3.5 shrink-0 text-muted-foreground" />
          {options.length === 1 ? '1 room free' : `${options.length} rooms free`}
        </span>
        <span className="truncate text-xs text-muted-foreground">
          {formatRange(stay.checkIn, stay.checkOut)} · {formatParty(stay.adults, stay.childAges)}
        </span>
      </div>
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
    </Card>
  );
}
