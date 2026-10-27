import { z } from 'zod';

/** A calendar date stored as `YYYY-MM-DD`. */
export const isoDateSchema = z.iso.date();
export type IsoDate = z.infer<typeof isoDateSchema>;
