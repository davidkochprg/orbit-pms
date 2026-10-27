import { z } from 'zod';
import { isoDateSchema } from './dates';
import { languageSchema } from './enums';

/** What the agent extracts from a raw guest inquiry. */
export const inquiryExtractionSchema = z.object({
  language: languageSchema,
  guestName: z.string().nullable(),
  checkIn: isoDateSchema,
  checkOut: isoDateSchema,
  adults: z.number().int().positive(),
  childAges: z.array(z.number().int().nonnegative()),
  wishes: z.object({
    wellness: z.boolean(),
    dog: z.boolean(),
    apartment: z.boolean(),
  }),
});
export type InquiryExtraction = z.infer<typeof inquiryExtractionSchema>;
