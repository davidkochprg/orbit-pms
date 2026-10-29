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
import { BookingRow, Mention } from '@/components/agent-mention';
import { ResultCards } from '@/components/agent-result-cards';
import { ConfirmAllButton, PendingActionCard } from '@/components/pending-action-card';
import { AgentEntitiesContext } from '@/hooks/use-agent-entities';
import {
  asProposal,
  asToolError,
  type AgentOrbState,
  orbStateFor,
  toolLabel,
  toolResultSummary,
} from '@/lib/agent';
import { collectEntities, type Inline, parseAnswer } from '@/lib/agent-answer';
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
      <ResultCards
        results={tools.flatMap((p) =>
          p.state === 'output-available'
            ? [{ id: p.toolCallId, name: getToolName(p), input: p.input, output: p.output }]
            : [],
        )}
      />
      {proposals.map((p) => (
        <PendingActionCard key={p.pendingActionId} id={p.pendingActionId} summary={p.summary} />
      ))}
      {proposals.length > 1 && <ConfirmAllButton ids={proposals.map((p) => p.pendingActionId)} />}
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
