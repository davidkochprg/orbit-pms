import { Chat, useChat } from '@ai-sdk/react';
import { type AgentContext, hotelInfoCategoryLabels, withoutLinks } from '@orbit/shared';
import { DefaultChatTransport, type UIMessage } from 'ai';
import { BorderBeam } from 'border-beam';
import { Command as CommandPrimitive } from 'cmdk';
import {
  ArrowLeft,
  CalendarPlus,
  CornerDownLeft,
  LogIn,
  LogOut,
  Monitor,
  Moon,
  Search,
  Sun,
  Sunrise,
  UserPlus,
} from 'lucide-react';
import { LogoMark } from '@/components/logo-mark';
import {
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router';
import { AgentStatus } from '@/components/agent-status';
import { AgentContextChip } from '@/components/agent-context-chip';
import { FollowUps } from '@/components/agent-follow-ups';
import { AgentThread } from '@/components/agent-thread';
import { ErrorNotice } from '@/components/error-notice';
import { GuestAvatar } from '@/components/guest-avatar';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Kbd } from '@/components/ui/kbd';
import { useBookingDrawer } from '@/hooks/use-booking-drawer';
import { useBookingEditor } from '@/hooks/use-booking-editor';
import {
  CommandPaletteContext,
  useCommandPalette,
  type OpenPaletteOptions,
  type PaletteMode,
} from '@/hooks/use-command-palette';
import { useDarkMode } from '@/hooks/use-dark-mode';
import { useSession } from '@/hooks/use-session';
import { agentErrorMessage, proposalIds, suggestedQuestions, toolResults } from '@/lib/agent';
import { contextFromLocation } from '@/lib/agent-context';
import {
  recentConversations,
  rememberConversation,
  settledMessages,
  type StoredConversation,
  subscribeConversations,
} from '@/lib/agent-history';
import { paletteMatch } from '@/lib/palette-match';
import { followUps } from '@/lib/agent-follow-ups';
import {
  useDayOverview,
  useGuests,
  useHealth,
  useHotelInfo,
  usePendingActions,
  useResolveAnyPendingAction,
} from '@/lib/api';
import { formatRecent } from '@/lib/format';
import { folderIcons, noteHref } from '@/lib/knowledge';
import { navItems } from '@/lib/nav';
import { useTheme } from '@/lib/theme';
import { cn } from '@/lib/utils';

const transport = new DefaultChatTransport({ api: '/api/agent' });
const ASK = '__ask__';

const newChat = (conversation?: StoredConversation) =>
  new Chat<UIMessage>({ id: conversation?.id, messages: conversation?.messages, transport });

/**
 * The ⌘K command bar: search and navigation, and the agent. The open conversation lives here, so
 * it survives closing the bar; the latest few are kept in the browser to go back to.
 */
export function CommandPaletteProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<PaletteMode>('search');
  const [text, setText] = useState('');
  const dark = useDarkMode();

  // Each staff member has their own recent conversations, and starts on a new one.
  const { storedId } = useSession();
  const staffKey = storedId ?? 'signed-out';
  const recent = useSyncExternalStore(subscribeConversations, () => recentConversations(staffKey));
  const [instance, setInstance] = useState(() => newChat());
  const [chatFor, setChatFor] = useState(staffKey);
  if (chatFor !== staffKey) {
    setChatFor(staffKey);
    setInstance(newChat());
  }
  const chat = useChat({ chat: instance });
  const working = chat.status === 'submitted' || chat.status === 'streaming';

  /** Shows another conversation; the one left behind stops answering. */
  const current = useRef(instance);
  useEffect(() => {
    current.current = instance;
  }, [instance]);
  const switchTo = useCallback((next: Chat<UIMessage>) => {
    void current.current.stop();
    setInstance(next);
  }, []);

  // Kept once a question is asked and again once it is answered. A reply that broke off is
  // left out, so the conversation can carry on later.
  useEffect(() => {
    if (chat.status === 'streaming') return;
    rememberConversation(
      staffKey,
      chat.id,
      settledMessages(chat.messages, chat.status === 'error'),
    );
  }, [chat.id, chat.messages, chat.status, staffKey]);

  // What the next questions are about: the page's booking, guest or conversation, read when the
  // bar opens; the staff member can leave it out.
  const location = useLocation();
  const pageContext = useRef<AgentContext | null>(null);
  const [context, setContext] = useState<AgentContext | null>(null);
  const isOpen = useRef(false);
  useEffect(() => {
    pageContext.current = contextFromLocation(location.pathname, location.search);
  }, [location.pathname, location.search]);
  useEffect(() => {
    isOpen.current = open;
  }, [open]);

  const openPalette = useCallback(
    (options?: OpenPaletteOptions) => {
      // "Ask Orbit" on a booking starts a new conversation about it.
      if (options?.mode === 'agent' && current.current.messages.length > 0) switchTo(newChat());
      setMode(options?.mode ?? 'search');
      setText(options?.text ?? '');
      setContext(options?.context !== undefined ? options.context : pageContext.current);
      setOpen(true);
    },
    [switchTo],
  );

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        if (!isOpen.current) setContext(pageContext.current);
        setOpen(!isOpen.current);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const send = (target: Chat<UIMessage>, question: string) =>
    void target.sendMessage({ text: question, ...(context && { metadata: { context } }) });

  /** Asks in the open conversation. */
  const ask = (question: string) => {
    const q = question.trim();
    if (!q || working) return;
    setMode('agent');
    setText('');
    send(instance, q);
  };

  /** Asks in a new conversation, unless the open one hasn't started. */
  const askNew = (question: string) => {
    const q = question.trim();
    if (!q) return;
    const target = chat.messages.length === 0 && !working ? instance : newChat();
    if (target !== instance) switchTo(target);
    setMode('agent');
    setText('');
    send(target, q);
  };

  /** Opens a conversation from the list, or a new one. */
  const openConversation = (conversation?: StoredConversation) => {
    setMode('agent');
    if (conversation?.id === chat.id) return;
    if (!conversation && chat.messages.length === 0 && !working) return;
    switchTo(newChat(conversation));
  };

  const closePalette = useCallback(() => setOpen(false), []);

  // A booking opened from the conversation brings the conversation back when its inspector closes.
  const { open: openDrawer } = useBookingDrawer();
  const [params] = useSearchParams();
  const drawerBooking = params.get('booking');
  const resumeAfter = useRef(false);
  const openBooking = useCallback(
    (bookingId: string) => {
      resumeAfter.current = true;
      setOpen(false);
      openDrawer(bookingId);
    },
    [openDrawer],
  );
  useEffect(() => {
    if (drawerBooking || !resumeAfter.current) return;
    resumeAfter.current = false;
    setMode('agent');
    setOpen(true);
  }, [drawerBooking]);

  const value = useMemo(
    () => ({ openPalette, closePalette, openBooking }),
    [openPalette, closePalette, openBooking],
  );

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
                  context={context}
                  text={text}
                  onTextChange={setText}
                  onAsk={askNew}
                  recent={recent}
                  onOpenConversation={openConversation}
                  close={() => setOpen(false)}
                />
              ) : (
                <AgentView
                  chat={chat}
                  context={context}
                  onClearContext={() => setContext(null)}
                  text={text}
                  onTextChange={setText}
                  onAsk={ask}
                  onBack={() => setMode('search')}
                  onNew={() => openConversation()}
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
  context,
  text,
  onTextChange,
  onAsk,
  recent,
  onOpenConversation,
  close,
}: {
  context: AgentContext | null;
  text: string;
  onTextChange: (text: string) => void;
  /** Asks in a new conversation. */
  onAsk: (question: string) => void;
  recent: StoredConversation[];
  /** Opens a recent conversation, or a new one when none is given. */
  onOpenConversation: (conversation?: StoredConversation) => void;
  close: () => void;
}) {
  const navigate = useNavigate();
  const { open: openBooking } = useBookingDrawer();
  const { openNew } = useBookingEditor();
  const { setTheme } = useTheme();
  const health = useHealth();
  const guests = useGuests();
  const notes = useHotelInfo();
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
        value === ASK ? 1 : paletteMatch(value, search, keywords)
      }
      className="flex min-h-0 flex-col"
    >
      <InputRow icon={<Search className="size-[18px]" />}>
        <CommandPrimitive.Input
          autoFocus
          value={text}
          onValueChange={onTextChange}
          placeholder={aiOn ? 'Ask Orbit or search…' : 'Search guests, notes and pages…'}
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
              <LogoMark className="text-primary-text" />
              <span className="truncate">
                Ask Orbit: <span className="text-muted-foreground">{query}</span>
              </span>
              {context && <AgentContextChip context={context} className="ml-1" />}
            </Item>
          </CommandPrimitive.Group>
        )}

        {!query && aiOn && (
          <CommandPrimitive.Group heading="Agent">
            <Item value="New conversation" onSelect={() => onOpenConversation()}>
              <LogoMark className="text-primary-text" /> New conversation
            </Item>
            {recent.map((c) => (
              <Item
                key={c.id}
                value={`conversation ${c.id}`}
                onSelect={() => onOpenConversation(c)}
                className="h-8 text-[0.8125rem] text-muted-foreground data-[selected=true]:text-foreground"
              >
                {/* Under the new conversation's icon, so the titles line up with its label. */}
                <span aria-hidden className="w-4 shrink-0" />
                <span className="min-w-0 flex-1 truncate">{c.title}</span>
                <time className="shrink-0 text-xs text-subtle-foreground tabular-nums">
                  {formatRecent(c.updatedAt)}
                </time>
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

        {query && notes.data && (
          <CommandPrimitive.Group heading="Knowledge">
            {notes.data.map((n) => {
              const Icon = folderIcons[n.category];
              const text = withoutLinks(n.details).replace(/\s+/g, ' ');
              return (
                <Item
                  key={n.id}
                  value={n.title}
                  // A note is found by its folder, its tags and what it says, not only its title.
                  keywords={[hotelInfoCategoryLabels[n.category], ...(n.tags ?? []), text]}
                  onSelect={run(() => void navigate(noteHref(n.id)))}
                >
                  <Icon />
                  <span className="max-w-1/2 shrink-0 truncate">{n.title}</span>
                  <span className="min-w-0 truncate text-muted-foreground">{text}</span>
                </Item>
              );
            })}
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
  context,
  onClearContext,
  text,
  onTextChange,
  onAsk,
  onBack,
  onNew,
}: {
  chat: ReturnType<typeof useChat>;
  context: AgentContext | null;
  onClearContext: () => void;
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
  const proposals = useMemo(() => proposalIds(chat.messages), [chat.messages]);
  const statuses = usePendingActions(proposals);
  // The shortcuts act on the newest change still waiting, the one just proposed, once its card shows.
  const target = busy
    ? null
    : (proposals.findLast((_, i) => statuses[i]?.data?.status === 'pending') ?? null);
  const resolve = useResolveAnyPendingAction();
  const navigate = useNavigate();
  const { closePalette } = useCommandPalette();
  // Next steps come from what the latest answer showed, once it is finished.
  const lastMessage = chat.messages.at(-1);
  const next = useMemo(
    () =>
      chat.status === 'ready' && lastMessage?.role === 'assistant'
        ? followUps(toolResults(lastMessage))
        : [],
    [chat.status, lastMessage],
  );

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (!target || resolve.isPending || !(e.metaKey || e.ctrlKey)) return;
      const typing = e.target instanceof HTMLInputElement && e.target.value !== '';
      if (e.key === 'Enter') {
        e.preventDefault();
        resolve.mutate({ id: target, decision: 'confirm' });
      } else if (e.key === 'Backspace' && !typing) {
        e.preventDefault();
        resolve.mutate({ id: target, decision: 'reject' });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [target, resolve]);

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
    if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey && !e.nativeEvent.isComposing) {
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
          <LogoMark className="size-3.5 text-primary-text" /> Orbit
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
        <AgentThread
          messages={chat.messages}
          status={chat.status}
          lastTurnMinHeight={Math.max(0, viewHeight - TURN_GAP * 2)}
          targetActionId={target}
        />
        {chat.error && <ErrorNotice message={agentErrorMessage(chat.error)} className="mt-3" />}
      </div>

      {chat.messages.length === 0 && aiOn && (
        <div className="shrink-0 px-5 py-2.5">
          <FollowUps
            followUps={suggestedQuestions.map((q) => ({ label: q, ask: q }))}
            onPick={(f) => 'ask' in f && onAsk(f.ask)}
          />
        </div>
      )}
      {next.length > 0 && (
        <div className="shrink-0 border-t px-5 py-2.5">
          <FollowUps
            followUps={next}
            onPick={(f) => {
              if ('ask' in f) onAsk(f.ask);
              else {
                closePalette();
                void navigate(f.path);
              }
            }}
          />
        </div>
      )}
      {resolve.isError && (
        <p className="border-t px-5 py-2 text-xs text-destructive">{resolve.error.message}</p>
      )}
      <InputRow icon={<LogoMark className="size-[18px] text-primary-text" />} placement="bottom">
        {context && <AgentContextChip context={context} onRemove={onClearContext} />}
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
        {target && (
          <span className="flex items-center gap-1.5">
            <Kbd>⌘↵</Kbd> Confirm
          </span>
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
  keywords,
  onSelect,
  hint,
  className,
  children,
}: {
  value: string;
  /** More words the row is found by, besides its value. */
  keywords?: string[];
  onSelect: () => void;
  hint?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <CommandPrimitive.Item
      value={value}
      {...(keywords && { keywords })}
      onSelect={onSelect}
      className={cn(
        'group flex h-10 cursor-default items-center gap-2.5 rounded-lg px-3 text-sm outline-none select-none',
        'data-[selected=true]:bg-accent [&_svg]:size-4 [&_svg]:shrink-0 [&_svg:not([class*=text-])]:text-muted-foreground',
        className,
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
