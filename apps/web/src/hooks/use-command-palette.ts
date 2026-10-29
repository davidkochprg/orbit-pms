import type { AgentContext } from '@orbit/shared';
import { createContext, useContext } from 'react';

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
}

export const CommandPaletteContext = createContext<CommandPaletteContextValue | null>(null);

/** Opens the ⌘K command bar, where staff search and talk to the agent. */
export function useCommandPalette(): CommandPaletteContextValue {
  const ctx = useContext(CommandPaletteContext);
  if (!ctx) throw new Error('useCommandPalette must be used inside CommandPaletteProvider');
  return ctx;
}
