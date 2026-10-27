import { z } from 'zod';

/** What proposal tools return (see docs/ai.md): the card fetches the pending action by ID. */
const proposalSchema = z.object({
  pendingActionId: z.string(),
  summary: z.string(),
  status: z.literal('awaiting_confirmation'),
});
export type Proposal = z.infer<typeof proposalSchema>;

export function asProposal(output: unknown): Proposal | null {
  const parsed = proposalSchema.safeParse(output);
  return parsed.success ? parsed.data : null;
}

const toolErrorSchema = z.object({ error: z.object({ code: z.string(), message: z.string() }) });

export function asToolError(output: unknown): string | null {
  const parsed = toolErrorSchema.safeParse(output);
  return parsed.success ? parsed.data.error.message : null;
}

/** The chat transport throws the response body as the error message; show the API's message. */
export function agentErrorMessage(error: Error): string {
  try {
    const parsed = toolErrorSchema.safeParse(JSON.parse(error.message));
    if (parsed.success) return parsed.data.error.message;
  } catch {
    // Not JSON: fall through.
  }
  return 'The agent is unavailable right now. Please try again.';
}

const toolLabels: Record<string, [running: string, done: string]> = {
  listRooms: ['Looking up rooms', 'Looked up rooms'],
  searchBookings: ['Searching bookings', 'Searched bookings'],
  getBooking: ['Opening the booking', 'Opened the booking'],
  checkAvailability: ['Checking availability', 'Checked availability'],
  quote: ['Calculating the price', 'Calculated the price'],
  getArrivals: ['Checking arrivals', 'Checked arrivals'],
  getDepartures: ['Checking departures', 'Checked departures'],
  getDailyBrief: ['Reading the daily brief', 'Read the daily brief'],
  createHold: ['Preparing a hold', 'Prepared a hold'],
  confirmBooking: ['Preparing the confirmation', 'Prepared the confirmation'],
  cancelBooking: ['Preparing the cancellation', 'Prepared the cancellation'],
  moveBooking: ['Preparing the room move', 'Prepared the room move'],
  changeDates: ['Preparing the date change', 'Prepared the date change'],
  updateBooking: ['Preparing the booking change', 'Prepared the booking change'],
  getReport: ['Running the numbers', 'Ran the numbers'],
  getBill: ['Opening the bill', 'Opened the bill'],
  addCharge: ['Preparing the charge', 'Prepared the charge'],
  recordPayment: ['Preparing the payment', 'Prepared the payment'],
};

/** A plain-language line for a tool step, so staff see what the agent looked at. */
export function toolLabel(name: string, done: boolean): string {
  const labels = toolLabels[name];
  if (labels) return labels[done ? 1 : 0];
  return done ? `Ran ${name}` : `Running ${name}`;
}

/** Starting points shown in the command bar before anything is typed. */
export const suggestedQuestions = [
  'Who arrives today, and do any of them bring children?',
  'Which rooms are free this weekend for two adults?',
  'What does a week in the apartment cost for a family of four in August?',
];
