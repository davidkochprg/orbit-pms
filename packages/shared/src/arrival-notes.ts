import { z } from 'zod';
import { isoDateSchema } from './dates';
import { languageSchema } from './enums';
import { quoteAddonsSchema } from './quote';

/** A confirmed stay arriving soon whose guest hasn't heard from the hotel about it yet. */
export const arrivalNoteDueSchema = z.object({
  bookingId: z.string(),
  guestId: z.string(),
  guestName: z.string(),
  email: z.string(),
  language: languageSchema,
  roomName: z.string(),
  roomTypeName: z.string(),
  checkIn: isoDateSchema,
  checkOut: isoDateSchema,
  adults: z.number().int().positive(),
  childAges: z.array(z.number().int().nonnegative()),
  addons: quoteAddonsSchema,
});
export type ArrivalNoteDue = z.infer<typeof arrivalNoteDueSchema>;

export const arrivalNotesSchema = z.object({
  /** The arrival day the list is for. */
  date: isoDateSchema,
  due: z.array(arrivalNoteDueSchema),
});
export type ArrivalNotes = z.infer<typeof arrivalNotesSchema>;

/** The email before a stay: what staff send, as drafted or edited. */
export const arrivalNoteSchema = z.object({
  subject: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(5000),
});
export type ArrivalNote = z.infer<typeof arrivalNoteSchema>;
