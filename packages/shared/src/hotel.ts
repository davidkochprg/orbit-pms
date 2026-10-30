import { z } from 'zod';
import { isoDateSchema } from './dates';
import { languageSchema } from './enums';

/** What an entry in the hotel profile describes: a rule, a facility, or anything else guests ask. */
export const hotelInfoCategories = ['policy', 'amenity', 'info'] as const;
export const hotelInfoCategorySchema = z.enum(hotelInfoCategories);
export type HotelInfoCategory = z.infer<typeof hotelInfoCategorySchema>;

/** A time of day, `HH:MM`, 24-hour clock. */
export const timeOfDaySchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use a 24-hour time like 15:00');

/** Who last wrote an entry: staff in Knowledge, the agent when asked, or a reply staff sent. */
export const hotelInfoSources = ['staff', 'agent', 'reply'] as const;
export const hotelInfoSourceSchema = z.enum(hotelInfoSources);
export type HotelInfoSource = z.infer<typeof hotelInfoSourceSchema>;

/** One fact staff and the agent may tell guests, e.g. "Parking: free, behind the house". */
export const hotelInfoEntrySchema = z.object({
  id: z.string().min(1).max(40),
  category: hotelInfoCategorySchema,
  title: z.string().trim().min(1).max(80),
  details: z.string().trim().min(1).max(600),
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
  details: z.string().trim().min(1).max(600),
  until: isoDateSchema.nullable(),
});
export type HotelInfoDraft = z.infer<typeof hotelInfoDraftSchema>;

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
