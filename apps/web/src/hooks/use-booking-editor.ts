import { createContext, useContext } from 'react';
import type { NewBookingPrefill } from '@/lib/booking-editor';

export interface BookingEditorContextValue {
  /** Opens "New booking", optionally with what is already known (room, dates, guest…). */
  openNew: (prefill?: NewBookingPrefill) => void;
  openEdit: (bookingId: string) => void;
}

export const BookingEditorContext = createContext<BookingEditorContextValue | null>(null);

/** Opens the booking editor from anywhere: a button, a menu or an empty tape chart cell. */
export function useBookingEditor(): BookingEditorContextValue {
  const ctx = useContext(BookingEditorContext);
  if (!ctx) throw new Error('useBookingEditor must be used inside BookingEditorProvider');
  return ctx;
}
