import { createContext, useContext } from 'react';

export interface ToastOptions {
  /** What just happened, e.g. "Room 104 marked clean". */
  title: string;
  /** One action, typically Undo. */
  action?: { label: string; run: () => void };
}

export interface ToastContextValue {
  toast: (options: ToastOptions) => void;
}

export const ToastContext = createContext<ToastContextValue | null>(null);

/** Confirms a quick change with a short message at the bottom of the screen. */
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside ToastProvider');
  return ctx;
}
