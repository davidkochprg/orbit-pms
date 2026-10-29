import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { BorderBeam } from 'border-beam';
import { Command as CommandPrimitive, defaultFilter } from 'cmdk';
import {
  ArrowLeft,
  CalendarPlus,
  CornerDownLeft,
  LogIn,
  LogOut,
  Monitor,
  Moon,
  Search,
  Sparkles,
  Sun,
  Sunrise,
  UserPlus,
} from 'lucide-react';
import {
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useNavigate } from 'react-router';
import { AgentStatus } from '@/components/agent-status';
import { AgentThread } from '@/components/agent-thread';
import { ErrorNotice } from '@/components/error-notice';
import { GuestAvatar } from '@/components/guest-avatar';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Kbd } from '@/components/ui/kbd';
import { useBookingDrawer } from '@/hooks/use-booking-drawer';
import { useBookingEditor } from '@/hooks/use-booking-editor';
import {
  CommandPaletteContext,
  type OpenPaletteOptions,
  type PaletteMode,
} from '@/hooks/use-command-palette';
import { useDarkMode } from '@/hooks/use-dark-mode';
import { agentErrorMessage, suggestedQuestions } from '@/lib/agent';
import { useDayOverview, useGuests, useHealth } from '@/lib/api';
import { navItems } from '@/lib/nav';
import { useTheme } from '@/lib/theme';
import { cn } from '@/lib/utils';

const transport = new DefaultChatTransport({ api: '/api/agent' });
const ASK = '__ask__';

/**
 * The ⌘K command bar: search and navigation, and the agent. The conversation lives here, so it
 * survives closing the bar and is there again on the next ⌘K.
 */
export function CommandPaletteProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<PaletteMode>('search');
  const [text, setText] = useState('');
  const chat = useChat({ transport });
  const dark = useDarkMode();
  const working = chat.status === 'submitted' || chat.status === 'streaming';

  const openPalette = useCallback((options?: OpenPaletteOptions) => {
    setMode(options?.mode ?? 'search');
    setText(options?.text ?? '');
    setOpen(true);
  }, []);

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const ask = (question: string) => {
    const q = question.trim();
    if (!q || chat.status === 'submitted' || chat.status === 'streaming') return;
    setMode('agent');
    setText('');
    void chat.sendMessage({ text: q });
  };

  const closePalette = useCallback(() => setOpen(false), []);
  const value = useMemo(() => ({ openPalette, closePalette }), [openPalette, closePalette]);

  return (
    <CommandPaletteContext value={value}>
      {children}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          showCloseButton={false}
          // A transparent shell: the panel is inside the beam, so its glow isn't clipped.
          className={cn(
            'top-[12vh] block translate-y-0 gap-0 rounded-card border-0 bg-transparent p-0 shadow-none ring-0 transition-[max-width] duration-200 ease-snap',
            // The conversation gets more room: cards with four figures need it.
            mode === 'agent' ? 'sm:max-w-[760px]' : 'sm:max-w-[640px]',
          )}
          onEscapeKeyDown={(e) => {
            // Like Raycast: Escape steps back from the agent to search before it closes.
            if (mode === 'agent') {
              e.preventDefault();
              setMode('search');
            }
          }}
        >
          <DialogTitle className="sr-only">Command bar</DialogTitle>
          <DialogDescription className="sr-only">
            Search guests and pages, or ask the Orbit agent.
          </DialogDescription>
          {/* The beam runs round the bar only while the agent is working. */}
          <BorderBeam
            active={working}
            size="md"
            theme={dark ? 'dark' : 'light'}
            brightness={1.8}
            glowSize={1.4}
            borderRadius={14}
            className="rounded-card"
          >
            <div className="relative flex max-h-[76vh] flex-col overflow-hidden rounded-card bg-popover shadow-floating backdrop-blur-2xl stroke-lit">
              {mode === 'search' ? (
                <SearchView
                  text={text}
                  onTextChange={setText}
                  onAsk={ask}
                  onShowThread={chat.messages.length > 0 ? () => setMode('agent') : undefined}
                  close={() => setOpen(false)}
                />
              ) : (
                <AgentView
                  chat={chat}
                  text={text}
                  onTextChange={setText}
                  onAsk={ask}
                  onBack={() => setMode('search')}
                  onNew={() => {
                    void chat.stop();
                    chat.setMessages([]);
                    chat.clearError();
                  }}
                />
              )}
            </div>
          </BorderBeam>
        </DialogContent>
      </Dialog>
    </CommandPaletteContext>
  );
}

function SearchView({
  text,
  onTextChange,
  onAsk,
  onShowThread,
  close,
}: {
  text: string;
  onTextChange: (text: string) => void;
  onAsk: (question: string) => void;
  onShowThread: (() => void) | undefined;
  close: () => void;
}) {
  const navigate = useNavigate();
  const { open: openBooking } = useBookingDrawer();
  const { openNew } = useBookingEditor();
  const { setTheme } = useTheme();
  const health = useHealth();
  const guests = useGuests();
  const day = useDayOverview();
  const aiOn = health.data?.ai.configured ?? false;
  const query = text.trim();

  const run = (fn: () => void) => () => {
    fn();
    close();
  };

  const today = day.data
    ? [
        ...day.data.arrivals.map((s) => ({ ...s, kind: 'Arriving' as const })),
        ...day.data.departures.map((s) => ({ ...s, kind: 'Leaving' as const })),
      ]
    : [];

  return (
    <CommandPrimitive
      loop
      // The "Ask Orbit" row always matches and stays on top, so Enter asks by default.
      filter={(value, search, keywords) =>
        value === ASK ? 1 : defaultFilter(value, search, keywords)
      }
      className="flex min-h-0 flex-col"
    >
      <InputRow icon={<Search className="size-[18px]" />}>
        <CommandPrimitive.Input
          autoFocus
          value={text}
          onValueChange={onTextChange}
          placeholder={aiOn ? 'Ask Orbit or search…' : 'Search guests and pages…'}
          className="h-full flex-1 bg-transparent text-base outline-none placeholder:text-subtle-foreground"
        />
      </InputRow>

      <CommandPrimitive.List className="scrollbar-thin min-h-0 flex-1 overflow-y-auto p-2 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-subtle-foreground">
        <CommandPrimitive.Empty className="py-10 text-center text-sm text-muted-foreground">
          Nothing matches “{query}”.
        </CommandPrimitive.Empty>

        {query && aiOn && (
          <CommandPrimitive.Group>
            <Item value={ASK} onSelect={() => onAsk(query)} hint="Ask">
              <Sparkles className="text-primary-text" />
              <span className="truncate">
                Ask Orbit: <span className="text-muted-foreground">{query}</span>
              </span>
            </Item>
          </CommandPrimitive.Group>
        )}

        {!query && onShowThread && (
          <CommandPrimitive.Group heading="Agent">
            <Item value="Continue conversation" onSelect={onShowThread}>
              <Sparkles className="text-primary-text" /> Continue the conversation
            </Item>
          </CommandPrimitive.Group>
        )}

        {!query && aiOn && (
          <CommandPrimitive.Group heading="Ask Orbit">
            {suggestedQuestions.map((q) => (
              <Item key={q} value={q} onSelect={() => onAsk(q)}>
                <Sparkles className="text-primary-text" /> {q}
              </Item>
            ))}
          </CommandPrimitive.Group>
        )}

        <CommandPrimitive.Group heading="Create">
          <Item value="New booking reservation hold" onSelect={run(() => openNew())}>
            <CalendarPlus /> New booking
          </Item>
          <Item value="New guest" onSelect={run(() => void navigate('/guests?new=guest'))}>
            <UserPlus /> New guest
          </Item>
        </CommandPrimitive.Group>

        {today.length > 0 && (
          <CommandPrimitive.Group heading="Today">
            {today.map(({ booking, guestName, roomName, kind }) => (
              <Item
                key={`${kind}-${booking.id}`}
                value={`${guestName} ${roomName} ${booking.id}`}
                onSelect={run(() => openBooking(booking.id))}
              >
                {kind === 'Arriving' ? <LogIn /> : <LogOut />}
                <span className="truncate">{guestName}</span>
                <span className="truncate text-muted-foreground">
                  {kind} · Room {roomName}
                </span>
              </Item>
            ))}
          </CommandPrimitive.Group>
        )}

        <CommandPrimitive.Group heading="Go to">
          {navItems.map((item) => (
            <Item
              key={item.path}
              value={`Go to ${item.label}`}
              onSelect={run(() => void navigate(item.path))}
            >
              <item.icon /> {item.label}
            </Item>
          ))}
        </CommandPrimitive.Group>

        {query && guests.data && (
          <CommandPrimitive.Group heading="Guests">
            {guests.data.map((g) => (
              <Item
                key={g.id}
                value={`${g.name} ${g.email ?? ''} ${g.id}`}
                onSelect={run(() => void navigate(`/guests/${g.id}`))}
              >
                <GuestAvatar name={g.name} className="size-4 text-[8px]" />
                <span className="truncate">{g.name}</span>
                {g.email && <span className="truncate text-muted-foreground">{g.email}</span>}
              </Item>
            ))}
          </CommandPrimitive.Group>
        )}

        <CommandPrimitive.Group heading="Appearance">
          {(
            [
              ['light', 'Light', Sun],
              ['dark', 'Dark', Moon],
              ['daylight', 'Daylight', Sunrise],
              ['system', 'Match system', Monitor],
            ] as const
          ).map(([theme, label, Icon]) => (
            <Item
              key={theme}
              value={`Theme ${label} appearance`}
              onSelect={run(() => setTheme(theme))}
            >
              <Icon /> {theme === 'system' ? label : `${label} appearance`}
            </Item>
          ))}
        </CommandPrimitive.Group>
      </CommandPrimitive.List>

      <Footer>
        <span className="flex items-center gap-1.5">
          <Kbd>
            <CornerDownLeft />
          </Kbd>
          Open
        </span>
        <span className="flex items-center gap-1.5">
          <Kbd>esc</Kbd> Close
        </span>
      </Footer>
    </CommandPrimitive>
  );
}

/** Breathing room above a question scrolled to the top of the thread. */
const TURN_GAP = 16;

function AgentView({
  chat,
  text,
  onTextChange,
  onAsk,
  onBack,
  onNew,
}: {
  chat: ReturnType<typeof useChat>;
  text: string;
  onTextChange: (text: string) => void;
  onAsk: (question: string) => void;
  onBack: () => void;
  onNew: () => void;
}) {
  const health = useHealth();
  const aiOn = health.data?.ai.configured ?? false;
  const busy = chat.status === 'submitted' || chat.status === 'streaming';
  const scroller = useRef<HTMLDivElement>(null);
  const [viewHeight, setViewHeight] = useState(0);
  const lastQuestion = chat.messages.findLast((m) => m.role === 'user')?.id;

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setViewHeight(el.clientHeight));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // A new question goes to the top and its answer fills in below it, read from the start; the
  // last turn is tall enough for that. Reopening the bar shows the latest question the same way.
  useLayoutEffect(() => {
    const el = scroller.current;
    const turn = lastQuestion && el?.querySelector<HTMLElement>(`[data-turn="${lastQuestion}"]`);
    if (el && turn) el.scrollTop = turn.offsetTop - TURN_GAP;
  }, [lastQuestion]);

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
      e.preventDefault();
      onAsk(text);
    }
    if (e.key === 'Backspace' && text === '' && chat.messages.length === 0) onBack();
  }

  return (
    <div className="flex h-[min(46rem,76vh)] min-h-0 flex-col">
      <div className="flex h-11 shrink-0 items-center gap-2 border-b px-3 text-sm text-muted-foreground">
        <button
          type="button"
          aria-label="Back to search"
          onClick={onBack}
          className="rounded-md p-1 hover:bg-accent hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
        </button>
        <span className="flex items-center gap-1.5 font-medium text-foreground">
          <Sparkles className="size-3.5 text-primary-text" /> Orbit
        </span>
        {chat.messages.length > 0 && !busy && (
          <button
            type="button"
            onClick={onNew}
            className="ml-auto rounded px-1.5 py-0.5 text-xs hover:bg-accent hover:text-foreground"
          >
            New conversation
          </button>
        )}
      </div>

      <div
        ref={scroller}
        className="scrollbar-thin relative min-h-0 flex-1 overflow-y-auto px-5 py-4"
      >
        {!aiOn && (
          <p className="text-muted-foreground">
            The agent is not configured on this server. Set the Meta API variables to use it.
          </p>
        )}
        {aiOn && chat.messages.length === 0 && (
          <p className="text-muted-foreground">
            Ask about arrivals, availability or prices, or tell Orbit what to change. Changes wait
            for your confirmation.
          </p>
        )}
        <AgentThread
          messages={chat.messages}
          status={chat.status}
          lastTurnMinHeight={Math.max(0, viewHeight - TURN_GAP * 2)}
        />
        {chat.error && <ErrorNotice message={agentErrorMessage(chat.error)} className="mt-3" />}
      </div>

      <InputRow icon={<Sparkles className="size-[18px] text-primary-text" />} placement="bottom">
        <input
          autoFocus
          value={text}
          onChange={(e) => onTextChange(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={!aiOn}
          placeholder={chat.messages.length > 0 ? 'Ask a follow-up…' : 'Ask Orbit…'}
          className="h-full flex-1 bg-transparent text-base outline-none placeholder:text-subtle-foreground"
        />
      </InputRow>

      <Footer>
        {busy && (
          <button
            type="button"
            onClick={() => void chat.stop()}
            className="rounded px-1 hover:text-foreground"
          >
            Stop
          </button>
        )}
        <span className="flex items-center gap-1.5">
          <Kbd>
            <CornerDownLeft />
          </Kbd>
          Send
        </span>
        <span className="flex items-center gap-1.5">
          <Kbd>esc</Kbd> Back
        </span>
      </Footer>
    </div>
  );
}

function InputRow({
  icon,
  children,
  placement = 'top',
}: {
  icon: ReactNode;
  children: ReactNode;
  /** Search types at the top; the agent's input sits under the conversation. */
  placement?: 'top' | 'bottom';
}) {
  return (
    <div
      className={cn(
        'flex h-14 shrink-0 items-center gap-3 px-5 text-muted-foreground [&_input]:text-foreground',
        placement === 'top' ? 'border-b' : 'border-t',
      )}
    >
      {icon}
      {children}
    </div>
  );
}

function Footer({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-10 shrink-0 items-center gap-4 border-t px-4 text-xs text-muted-foreground">
      <span className="mr-auto">
        <AgentStatus />
      </span>
      {children}
    </div>
  );
}

function Item({
  value,
  onSelect,
  hint,
  children,
}: {
  value: string;
  onSelect: () => void;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <CommandPrimitive.Item
      value={value}
      onSelect={onSelect}
      className={cn(
        'group flex h-10 cursor-default items-center gap-2.5 rounded-lg px-3 text-sm outline-none select-none',
        'data-[selected=true]:bg-accent [&_svg]:size-4 [&_svg]:shrink-0 [&_svg:not([class*=text-])]:text-muted-foreground',
      )}
    >
      {children}
      {hint && (
        <span className="ml-auto hidden items-center gap-1.5 text-xs text-muted-foreground group-data-[selected=true]:flex">
          {hint}
          <Kbd>
            <CornerDownLeft />
          </Kbd>
        </span>
      )}
    </CommandPrimitive.Item>
  );
}
