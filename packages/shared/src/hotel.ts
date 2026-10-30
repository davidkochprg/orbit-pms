import { z } from 'zod';
import { isoDateSchema } from './dates';
import { languageSchema } from './enums';

/**
 * The folders of Knowledge, the hotel's notes for guests. Orbit files each note in one; staff
 * never have to choose.
 */
export const hotelInfoCategories = [
  'policies',
  'rooms',
  'food',
  'wellness',
  'activities',
  'getting_here',
  'services',
] as const;
export const hotelInfoCategorySchema = z.enum(hotelInfoCategories);
export type HotelInfoCategory = z.infer<typeof hotelInfoCategorySchema>;

export const hotelInfoCategoryLabels: Record<HotelInfoCategory, string> = {
  policies: 'Policies',
  rooms: 'Rooms & stays',
  food: 'Food & drink',
  wellness: 'Wellness',
  activities: 'Things to do',
  getting_here: 'Getting here',
  services: 'Services',
};

/** Before folders, entries were a policy, an amenity or other guest info. */
const legacyCategories: Record<string, HotelInfoCategory> = {
  policy: 'policies',
  amenity: 'services',
  info: 'services',
};

/** A stored entry's folder, reading the old three categories as folders. */
const storedCategorySchema = z.preprocess(
  (value) => (typeof value === 'string' ? (legacyCategories[value] ?? value) : value),
  hotelInfoCategorySchema,
);

/** Short lowercase labels across folders, e.g. "pets", "ev charging". */
export const hotelInfoTagsSchema = z.array(z.string().trim().toLowerCase().min(1).max(24)).max(6);

/** A time of day, `HH:MM`, 24-hour clock. */
export const timeOfDaySchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use a 24-hour time like 15:00');

/** Who last wrote an entry: staff in Knowledge, the agent when asked, or a reply staff sent. */
export const hotelInfoSources = ['staff', 'agent', 'reply'] as const;
export const hotelInfoSourceSchema = z.enum(hotelInfoSources);
export type HotelInfoSource = z.infer<typeof hotelInfoSourceSchema>;

/** A note in Knowledge: one thing staff and the agent tell guests, e.g. "Parking". */
export const hotelInfoEntrySchema = z.object({
  id: z.string().min(1).max(40),
  category: storedCategorySchema,
  title: z.string().trim().min(1).max(80),
  /** The note: plain text, "- " lists, and [[Title]] links to other notes. */
  details: z.string().trim().min(1).max(1000),
  tags: hotelInfoTagsSchema.optional(),
  /** The last day a temporary notice applies, e.g. "Sauna closed"; absent or null if it always does. */
  until: isoDateSchema.nullable().optional(),
  /** Absent for entries from before this was recorded, such as the seeded ones. */
  source: hotelInfoSourceSchema.optional(),
  updatedAt: z.iso.datetime().optional(),
});
export type HotelInfoEntry = z.infer<typeof hotelInfoEntrySchema>;

/**
 * A fact to keep in the hotel profile, as the agent proposes it. It replaces the entry with the
 * same title, so a correction updates what is there instead of adding a second version.
 */
export const hotelInfoDraftSchema = z.object({
  category: hotelInfoCategorySchema,
  title: z.string().trim().min(1).max(80),
  details: z.string().trim().min(1).max(1000),
  tags: hotelInfoTagsSchema.default([]),
  until: isoDateSchema.nullable(),
});
export type HotelInfoDraft = z.infer<typeof hotelInfoDraftSchema>;

/** What staff describe for Orbit to file as a note, in their own words. */
export const fileNoteBodySchema = z.object({ text: z.string().trim().min(1).max(1500) });

/**
 * A note as Orbit filed it, shown to staff before it is saved: a new note (`id` null) or an
 * existing one with what they described folded in.
 */
export const filedNoteSchema = z.object({
  id: z.string().nullable(),
  draft: hotelInfoDraftSchema,
});
export type FiledNote = z.infer<typeof filedNoteSchema>;

/** A fact the agent proposes, from staff asking it or from a reply they sent. */
export const hotelInfoProposalSchema = hotelInfoDraftSchema.extend({
  source: z.enum(['agent', 'reply']).default('agent'),
});
export type HotelInfoProposal = z.infer<typeof hotelInfoProposalSchema>;

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .transform((s) => (s === '' ? null : s));

/**
 * The property as staff describe it in Settings. The agent's prompts are built from it, so every
 * fact the agent may tell a guest about the hotel comes from here.
 */
export const hotelProfileSchema = z.object({
  name: z.string().trim().min(1).max(100),
  /** Address or region, as a guest would read it. */
  location: z.string().trim().min(1).max(200),
  /** A few sentences about the property. */
  description: optionalText(1000),
  phone: optionalText(40),
  email: z
    .union([z.literal(''), z.email()])
    .nullable()
    .transform((s) => (s === '' ? null : s)),
  website: optionalText(200),
  checkInFrom: timeOfDaySchema,
  checkOutBy: timeOfDaySchema,
  entries: z.array(hotelInfoEntrySchema).max(100),
  /**
   * ISO 3166 alpha-2 country the hotel is in. It sets the guest-book rules. Profiles saved before
   * it existed read as Czechia.
   */
  country: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/, 'Use a two-letter country code like US')
    .default('CZ'),
  /** The language the hotel works in: new staff and guests without one start with it. */
  language: languageSchema.default('cs'),
  /** Where the weather forecast is for; null for no forecast. */
  coordinates: z
    .object({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180) })
    .nullable()
    .default(null),
});
export type HotelProfile = z.infer<typeof hotelProfileSchema>;
