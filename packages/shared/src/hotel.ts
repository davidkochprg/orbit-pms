import { z } from 'zod';

/** What an entry in the hotel profile describes: a rule, a facility, or anything else guests ask. */
export const hotelInfoCategories = ['policy', 'amenity', 'info'] as const;
export const hotelInfoCategorySchema = z.enum(hotelInfoCategories);
export type HotelInfoCategory = z.infer<typeof hotelInfoCategorySchema>;

/** A time of day, `HH:MM`, 24-hour clock. */
export const timeOfDaySchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use a 24-hour time like 15:00');

/** One fact staff and the agent may tell guests, e.g. "Parking: free, behind the house". */
export const hotelInfoEntrySchema = z.object({
  id: z.string().min(1).max(40),
  category: hotelInfoCategorySchema,
  title: z.string().trim().min(1).max(80),
  details: z.string().trim().min(1).max(600),
});
export type HotelInfoEntry = z.infer<typeof hotelInfoEntrySchema>;

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
});
export type HotelProfile = z.infer<typeof hotelProfileSchema>;
