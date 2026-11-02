import type { AgentContext } from '@orbit/shared';
import { createContext, useContext, useEffect } from 'react';

export type PaletteMode = 'search' | 'agent';

export interface OpenPaletteOptions {
  mode?: PaletteMode;
  /** Text to put in the input. */
  text?: string;
  /**
   * What the questions are about, e.g. the booking whose "Ask Orbit" was clicked. Left out, it is
   * what the page shows; null asks about nothing in particular.
   */
  context?: AgentContext | null;
}

export interface CommandPaletteContextValue {
  openPalette: (options?: OpenPaletteOptions) => void;
  /** Closes the bar; the conversation stays for the next ⌘K. */
  closePalette: () => void;
  /**
   * Opens a booking in the inspector from the conversation: the bar steps aside and comes back,
   * on the conversation, when the inspector closes.
   */
  openBooking: (bookingId: string) => void;
  /** What the page shows when its URL doesn't say, e.g. the tape chart's dates; null for nothing. */
  setPageContext: (context: AgentContext | null) => void;
}

export const CommandPaletteContext = createContext<CommandPaletteContextValue | null>(null);

/** Opens the ⌘K command bar, where staff search and talk to the agent. */
export function useCommandPalette(): CommandPaletteContextValue {
  const ctx = useContext(CommandPaletteContext);
  if (!ctx) throw new Error('useCommandPalette must be used inside CommandPaletteProvider');
  return ctx;
}

/**
 * Tells the command bar what this page shows, so a question asked from it is about that: the
 * tape chart's dates, a report's period, a night on the rate outlook. Records in the URL (an open
 * booking, guest, conversation, repair, contact or note) come first.
 */
export function usePageAgentContext(context: AgentContext | null): void {
  const { setPageContext } = useCommandPalette();
  const kind = context?.kind;
  const id = context?.id;
  useEffect(() => {
    setPageContext(kind && id ? { kind, id } : null);
    return () => setPageContext(null);
  }, [setPageContext, kind, id]);
}
