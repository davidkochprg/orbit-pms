import { z } from 'zod';

export const guestMemoryKinds = ['preference', 'occasion', 'care', 'habit'] as const;
export const guestMemoryKindSchema = z.enum(guestMemoryKinds);
export type GuestMemoryKind = z.infer<typeof guestMemoryKindSchema>;

/** One thing worth remembering about a guest for their next stay. */
export const guestMemoryItemSchema = z.object({
  kind: guestMemoryKindSchema.describe(
    'preference: a room, bed or setting they want. occasion: a date or celebration. care: an allergy, diet or need. habit: how they travel or spend the stay.',
  ),
  text: z
    .string()
    .describe('One short English sentence for the front desk, e.g. "Prefers a quiet room."'),
});
export type GuestMemoryItem = z.infer<typeof guestMemoryItemSchema>;

/** What the model reads from a guest's history. */
export const guestMemoryReadingSchema = z.object({
  items: z.array(guestMemoryItemSchema).describe('At most five; [] when nothing is worth keeping.'),
});
export type GuestMemoryReading = z.infer<typeof guestMemoryReadingSchema>;

/** A guest's history as the model read it. A different history means it needs reading again. */
export const savedGuestMemorySchema = z.object({
  guestId: z.string(),
  items: z.array(guestMemoryItemSchema),
  source: z.string(),
  readAt: z.iso.datetime(),
});
export type SavedGuestMemory = z.infer<typeof savedGuestMemorySchema>;

/** What Orbit remembers about a guest, and whether it still matches their history. */
export const guestMemorySchema = z.object({
  guestId: z.string(),
  /** Stays that already ended. */
  pastStays: z.number().int().nonnegative(),
  items: z.array(guestMemoryItemSchema),
  /** Nothing in the history has changed since it was read. */
  current: z.boolean(),
  /** There is history to read: notes, earlier stays' notes or messages from the guest. */
  hasHistory: z.boolean(),
  readAt: z.iso.datetime().nullable(),
});
export type GuestMemory = z.infer<typeof guestMemorySchema>;
