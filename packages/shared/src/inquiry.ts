import { z } from 'zod';
import { isoDateSchema } from './dates';
import { languageSchema, roomKindSchema } from './enums';
import { quoteSchema } from './quote';

export const messageKinds = ['booking_request', 'question', 'other'] as const;
export const messageKindSchema = z.enum(messageKinds);
export type MessageKind = z.infer<typeof messageKindSchema>;

/**
 * What the model extracts from one guest message. Stay fields are null when the message does
 * not ask for a stay (e.g. a question about an existing booking).
 */
export const inquiryExtractionSchema = z.object({
  kind: messageKindSchema.describe(
    'booking_request: asks for a stay or a price. question: about an existing booking or the hotel. other: anything else.',
  ),
  language: languageSchema.describe('Language the guest wrote in.'),
  guestName: z.string().nullable().describe('Name as signed, or null.'),
  checkIn: isoDateSchema.nullable().describe('Arrival date YYYY-MM-DD, or null.'),
  checkOut: isoDateSchema
    .nullable()
    .describe('Departure date YYYY-MM-DD (the day they leave, not the last night), or null.'),
  adults: z.number().int().positive().nullable(),
  childAges: z.array(z.number().int().min(0).max(17)).describe('Age of each child; [] if none.'),
  wishes: z.object({
    wellness: z.boolean().describe('Asks about sauna, massage, spa or wellness.'),
    dog: z.boolean().describe('Travels with a dog or asks about pets.'),
    apartment: z.boolean().describe('Asks for an apartment or holiday flat.'),
  }),
  question: z
    .string()
    .nullable()
    .describe('One English sentence summarising any question, or null.'),
});
export type InquiryExtraction = z.infer<typeof inquiryExtractionSchema>;

/** A room the hotel can offer for the requested stay, with its exact price. */
export const stayOptionSchema = z.object({
  roomId: z.string(),
  roomName: z.string(),
  roomTypeName: z.string(),
  kind: roomKindSchema,
  quote: quoteSchema,
});
export type StayOption = z.infer<typeof stayOptionSchema>;

/** What the agent prepared for a message: offerable rooms and a reply draft. */
export const inquirySuggestionSchema = z.object({
  options: z.array(stayOptionSchema),
  /** Why there are no options, when there are none. */
  note: z.string().nullable(),
  draft: z.string().nullable(),
  draftLanguage: languageSchema.nullable(),
});
export type InquirySuggestion = z.infer<typeof inquirySuggestionSchema>;
