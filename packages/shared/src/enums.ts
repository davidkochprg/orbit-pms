import { z } from 'zod';

export const roomKinds = ['room', 'apartment'] as const;
export const roomKindSchema = z.enum(roomKinds);
export type RoomKind = z.infer<typeof roomKindSchema>;

export const roomStatuses = ['clean', 'dirty', 'inspected', 'out_of_order'] as const;
export const roomStatusSchema = z.enum(roomStatuses);
export type RoomStatus = z.infer<typeof roomStatusSchema>;

export const languages = ['cs', 'de', 'en', 'pl'] as const;
export const languageSchema = z.enum(languages);
export type Language = z.infer<typeof languageSchema>;

export const bookingStatuses = [
  'hold',
  'confirmed',
  'checked_in',
  'checked_out',
  'cancelled',
] as const;
export const bookingStatusSchema = z.enum(bookingStatuses);
export type BookingStatus = z.infer<typeof bookingStatusSchema>;

export const bookingSources = ['email', 'phone', 'web', 'ota', 'walk_in'] as const;
export const bookingSourceSchema = z.enum(bookingSources);
export type BookingSource = z.infer<typeof bookingSourceSchema>;

export const inquiryChannels = ['email', 'phone', 'web', 'ota'] as const;
export const inquiryChannelSchema = z.enum(inquiryChannels);
export type InquiryChannel = z.infer<typeof inquiryChannelSchema>;

export const inquiryStatuses = ['new', 'quoted', 'replied', 'converted', 'declined'] as const;
export const inquiryStatusSchema = z.enum(inquiryStatuses);
export type InquiryStatus = z.infer<typeof inquiryStatusSchema>;

export const housekeepingTaskTypes = ['turnover', 'stayover', 'maintenance'] as const;
export const housekeepingTaskTypeSchema = z.enum(housekeepingTaskTypes);
export type HousekeepingTaskType = z.infer<typeof housekeepingTaskTypeSchema>;

export const housekeepingTaskStatuses = ['open', 'in_progress', 'done'] as const;
export const housekeepingTaskStatusSchema = z.enum(housekeepingTaskStatuses);
export type HousekeepingTaskStatus = z.infer<typeof housekeepingTaskStatusSchema>;

/** Who fixes or supplies what. A maintenance task gets one; contacts have one or more. */
export const trades = [
  'plumbing',
  'electrical',
  'heating',
  'appliances',
  'internet',
  'locks',
  'pests',
  'building',
  'cleaning',
  'supplies',
] as const;
export const tradeSchema = z.enum(trades);
export type Trade = z.infer<typeof tradeSchema>;

export const auditActors = ['user', 'agent'] as const;
export const auditActorSchema = z.enum(auditActors);
export type AuditActor = z.infer<typeof auditActorSchema>;

export const bookingActions = ['confirm', 'check_in', 'check_out', 'cancel'] as const;
export const bookingActionSchema = z.enum(bookingActions);
export type BookingAction = z.infer<typeof bookingActionSchema>;
