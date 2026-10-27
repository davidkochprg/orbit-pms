import { createContext, useContext } from 'react';

export type PaletteMode = 'search' | 'agent';

export interface OpenPaletteOptions {
  mode?: PaletteMode;
  /** Text to put in the input, e.g. context about the booking the user is looking at. */
  text?: string;
}

export interface CommandPaletteContextValue {
  openPalette: (options?: OpenPaletteOptions) => void;
}

export const CommandPaletteContext = createContext<CommandPaletteContextValue | null>(null);

/** Opens the ⌘K command bar, where staff search and talk to the agent. */
export function useCommandPalette(): CommandPaletteContextValue {
  const ctx = useContext(CommandPaletteContext);
  if (!ctx) throw new Error('useCommandPalette must be used inside CommandPaletteProvider');
  return ctx;
}
