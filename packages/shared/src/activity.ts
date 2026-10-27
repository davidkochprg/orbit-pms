import { z } from 'zod';
import { auditLogEntrySchema } from './entities';
import { auditActorSchema } from './enums';

export const activitySubjectKinds = [
  'booking',
  'room',
  'room_type',
  'guest',
  'staff',
  'inquiry',
] as const;
export const activitySubjectKindSchema = z.enum(activitySubjectKinds);
export type ActivitySubjectKind = z.infer<typeof activitySubjectKindSchema>;

export const activityQuerySchema = z.object({
  actor: auditActorSchema.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});
export type ActivityQuery = z.infer<typeof activityQuerySchema>;

/** An audit entry with names to show it by: what it was about and which staff member did it. */
export const activityItemSchema = auditLogEntrySchema.extend({
  subject: z
    .object({ kind: activitySubjectKindSchema, id: z.string(), label: z.string() })
    .nullable(),
  /** The staff member, when the change recorded who made it. */
  byName: z.string().nullable(),
});
export type ActivityItem = z.infer<typeof activityItemSchema>;
