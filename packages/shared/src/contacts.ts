import { z } from 'zod';
import { isoDateSchema } from './dates';
import { housekeepingTaskSchema } from './entities';
import { languageSchema, type Trade, tradeSchema } from './enums';

export const tradeLabels: Record<Trade, string> = {
  plumbing: 'Plumbing',
  electrical: 'Electrical',
  heating: 'Heating & cooling',
  appliances: 'Appliances',
  internet: 'Internet & TV',
  locks: 'Locks & keys',
  pests: 'Pest control',
  building: 'Building & repairs',
  cleaning: 'Cleaning & laundry',
  supplies: 'Supplies',
};

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .transform((s) => (s === '' ? null : s));

/** A supplier or contractor the hotel calls: a plumber, the laundry, the bakery. */
export const contactSchema = z.object({
  id: z.string(),
  /** The business, or the person when they work alone. */
  name: z.string(),
  /** Who to ask for at the business. */
  person: z.string().nullable(),
  trades: z.array(tradeSchema).min(1),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  /** The language to write to them in. */
  language: languageSchema,
  notes: z.string().nullable(),
});
export type Contact = z.infer<typeof contactSchema>;

export const contactBodySchema = z.object({
  name: z.string().trim().min(1).max(100),
  person: optionalText(100),
  trades: z
    .array(tradeSchema)
    .min(1, 'Pick what they do')
    .max(4)
    .transform((t) => [...new Set(t)]),
  phone: optionalText(40),
  email: z
    .union([z.literal(''), z.email()])
    .nullable()
    .transform((s) => (s === '' ? null : s)),
  language: languageSchema,
  notes: optionalText(500),
});
export type ContactBody = z.infer<typeof contactBodySchema>;

/**
 * A contact the agent proposes to add (no `contactId`) or change. A change sends only what is
 * new; the rest stays as saved. Models sometimes write a missing ID as "null".
 */
export const contactProposalSchema = contactBodySchema.partial().extend({
  contactId: z
    .preprocess((v) => (v === 'null' || v === '' ? null : v), z.string().nullable())
    .optional()
    .describe('Leave out for a new contact.'),
});
export type ContactProposal = z.infer<typeof contactProposalSchema>;

/** When someone can work in a room without disturbing a guest. */
export const roomAccessSchema = z.object({
  /** The guest staying in the room tonight, if any. */
  guestName: z.string().nullable(),
  /** The first day the room is empty: today, or the day that guest leaves. */
  freeFrom: isoDateSchema,
  /** The day the next guest arrives after that; null when nobody is booked. */
  freeUntil: isoDateSchema.nullable(),
});
export type RoomAccess = z.infer<typeof roomAccessSchema>;

/** A repair with who can fix it and when they can get into the room. */
export const repairSchema = z.object({
  task: housekeepingTaskSchema,
  roomName: z.string(),
  access: roomAccessSchema,
  /** Contacts for the task's trade, the one asked last time first; none without a trade. */
  contacts: z.array(contactSchema),
  /** Who was asked to fix it, once someone was. */
  contact: contactSchema.nullable(),
});
export type Repair = z.infer<typeof repairSchema>;

export const repairContactBodySchema = z.object({ contactId: z.string().min(1) });
export type RepairContactBody = z.infer<typeof repairContactBodySchema>;

/** An email asking a contractor to come and fix something, for staff to edit and send. */
export const workOrderSchema = z.object({
  to: z.string().nullable(),
  subject: z.string(),
  body: z.string(),
});
export type WorkOrder = z.infer<typeof workOrderSchema>;
