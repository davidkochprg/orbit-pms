import { getToolName, isToolUIPart, type UIMessage } from 'ai';
import { z } from 'zod';
import { formatMoney } from '@/lib/format';

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

/** The changes the agent proposed in a conversation, oldest first. */
export function proposalIds(messages: UIMessage[]): string[] {
  return messages.flatMap((m) =>
    m.parts.filter(isToolUIPart).flatMap((p) => {
      const proposal = asProposal(p.state === 'output-available' ? p.output : undefined);
      return proposal ? [proposal.pendingActionId] : [];
    }),
  );
}

/** A finished tool step: what the agent asked for and what came back. */
export interface ToolResult {
  id: string;
  name: string;
  input: unknown;
  output: unknown;
}

/** The finished steps of an assistant message, in order. */
export function toolResults(message: UIMessage): ToolResult[] {
  return message.parts
    .filter(isToolUIPart)
    .flatMap((p) =>
      p.state === 'output-available'
        ? [{ id: p.toolCallId, name: getToolName(p), input: p.input, output: p.output }]
        : [],
    );
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
  checkIn: ['Preparing the check-in', 'Prepared the check-in'],
  checkOut: ['Preparing the check-out', 'Prepared the check-out'],
  moveBooking: ['Preparing the room move', 'Prepared the room move'],
  changeDates: ['Preparing the date change', 'Prepared the date change'],
  updateBooking: ['Preparing the booking change', 'Prepared the booking change'],
  getReport: ['Running the numbers', 'Ran the numbers'],
  getBill: ['Opening the bill', 'Opened the bill'],
  addCharge: ['Preparing the charge', 'Prepared the charge'],
  recordPayment: ['Preparing the payment', 'Prepared the payment'],
  updateCharge: ['Preparing the bill correction', 'Prepared the bill correction'],
  removeCharge: ['Preparing to remove the extra', 'Prepared to remove the extra'],
  getGuestBook: ['Opening the guest book', 'Opened the guest book'],
  addToGuestBook: ['Preparing the guest-book entry', 'Prepared the guest-book entry'],
  updateGuestBook: ['Preparing the guest-book update', 'Prepared the guest-book update'],
  removeFromGuestBook: ['Preparing the guest-book removal', 'Prepared the guest-book removal'],
  updateGuestProfile: ['Preparing the profile change', 'Prepared the profile change'],
  getHousekeeping: ['Checking housekeeping', 'Checked housekeeping'],
  setRoomStatus: ['Updating the room status', 'Updated the room status'],
  createHousekeepingTask: ['Creating the task', 'Created the task'],
  setTaskStatus: ['Updating the task', 'Updated the task'],
  saveHotelInfo: ['Preparing a Knowledge entry', 'Prepared a Knowledge entry'],
  removeHotelInfo: ['Preparing to delete the note', 'Prepared to delete the note'],
  getRateOutlook: ['Reading the rate outlook', 'Read the rate outlook'],
  adjustRates: ['Preparing the rate change', 'Prepared the rate change'],
  listConversations: ['Checking the inbox', 'Checked the inbox'],
  getConversation: ['Reading the conversation', 'Read the conversation'],
  draftReply: ['Drafting the reply', 'Drafted the reply'],
  sendReply: ['Preparing the reply', 'Prepared the reply'],
  holdFromConversation: ['Preparing a hold for the request', 'Prepared a hold for the request'],
  declineConversation: ['Preparing to decline the request', 'Prepared to decline the request'],
  getActivity: ['Checking the activity log', 'Checked the activity log'],
  getGuest: ['Opening the guest profile', 'Opened the guest profile'],
  getLocalEvents: ['Checking local events', 'Checked local events'],
  addLocalEvent: ['Preparing the local event', 'Prepared the local event'],
  removeLocalEvent: ['Preparing to remove the event', 'Prepared to remove the event'],
  updateRoom: ['Preparing the room change', 'Prepared the room change'],
  listContacts: ['Looking up contacts', 'Looked up contacts'],
  getRepair: ['Checking who can fix it', 'Checked who can fix it'],
  recordRepairContact: ['Noting who was asked', 'Noted who was asked'],
  saveContact: ['Preparing the contact', 'Prepared the contact'],
  removeContact: ['Preparing to delete the contact', 'Prepared to delete the contact'],
  organizeConversations: ['Filing the conversations', 'Filed the conversations'],
  getArrivalNotes: ["Checking tomorrow's arrivals", "Checked tomorrow's arrivals"],
  draftArrivalNote: ['Writing the note before the stay', 'Wrote the note before the stay'],
  sendArrivalNote: ['Preparing the email', 'Prepared the email'],
};

/** A plain-language line for a tool step, so staff see what the agent looked at. */
export function toolLabel(name: string, done: boolean): string {
  const labels = toolLabels[name];
  if (labels) return labels[done ? 1 : 0];
  return done ? `Ran ${name}` : `Running ${name}`;
}

/** The ThinkingOrb animations Orbit uses (see thinking-orbs). */
export type AgentOrbState = 'working' | 'searching' | 'solving' | 'weaving' | 'composing';

const orbStates: Record<string, AgentOrbState> = {
  quote: 'solving',
  getReport: 'solving',
  getBill: 'solving',
  draftReply: 'composing',
  draftArrivalNote: 'composing',
  setRoomStatus: 'weaving',
  createHousekeepingTask: 'weaving',
  setTaskStatus: 'weaving',
};

/** How the orb moves while a tool runs: looking things up, working figures out, or changing. */
export function orbStateFor(toolName: string): AgentOrbState {
  if (toolName in orbStates) return orbStates[toolName]!;
  if (/^(create|confirm|cancel|check|move|change|update|add|record|remove)/.test(toolName)) {
    return toolName === 'checkAvailability' ? 'searching' : 'weaving';
  }
  return 'searching';
}

const money = (n: number) => formatMoney(n);
const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null;

/** A few words about what a finished tool step found or did, e.g. "8 guests" or "$950 due". */
export function toolResultSummary(toolName: string, output: unknown): string | null {
  if (asProposal(output)) return 'Waiting for your confirmation';
  const error = asToolError(output);
  if (error) return error;
  if (Array.isArray(output)) {
    const noun: Record<string, [string, string]> = {
      getArrivals: ['guest', 'guests'],
      getDepartures: ['guest', 'guests'],
      searchBookings: ['booking', 'bookings'],
      checkAvailability: ['room free', 'rooms free'],
      listRooms: ['room', 'rooms'],
      listConversations: ['conversation', 'conversations'],
      getActivity: ['change', 'changes'],
      getLocalEvents: ['event', 'events'],
    };
    const [one, many] = noun[toolName] ?? ['result', 'results'];
    return output.length === 0 ? `No ${many}` : count(output.length, one, many);
  }
  if (!isObj(output)) return null;
  switch (toolName) {
    case 'quote':
      return typeof output.total === 'number' ? money(output.total) : null;
    case 'getBill': {
      const balance = output.balance;
      if (typeof balance !== 'number') return null;
      return balance > 0
        ? `${money(balance)} due`
        : balance < 0
          ? `${money(-balance)} owed back`
          : 'Paid in full';
    }
    case 'getBooking': {
      const guest = isObj(output.guest) ? output.guest.name : null;
      const room = isObj(output.room) ? output.room.name : null;
      return typeof guest === 'string' && typeof room === 'string'
        ? `${guest}, room ${room}`
        : null;
    }
    case 'getGuestBook': {
      const { partySize, missing } = output;
      if (typeof partySize !== 'number' || typeof missing !== 'number') return null;
      return missing === 0 ? 'Everyone registered' : `${count(missing, 'ID')} missing`;
    }
    case 'getDailyBrief': {
      const arrivals = output.arrivals;
      return typeof arrivals === 'number' ? `${count(arrivals, 'arrival')} today` : null;
    }
    case 'getReport': {
      const occupancy = output.occupancy;
      return typeof occupancy === 'number' ? `${Math.round(occupancy * 100)}% occupancy` : null;
    }
    case 'getGuest':
      return Array.isArray(output.stays) ? count(output.stays.length, 'stay') : null;
    case 'getConversation':
      return Array.isArray(output.messages) ? count(output.messages.length, 'message') : null;
    case 'draftReply':
      return typeof output.draft === 'string' ? 'Draft ready' : null;
    case 'getHousekeeping':
      return Array.isArray(output.rooms) ? count(output.rooms.length, 'room') : null;
    case 'setRoomStatus':
      return typeof output.roomName === 'string' && typeof output.status === 'string'
        ? `Room ${output.roomName} now ${output.status.replaceAll('_', ' ')}`
        : null;
    case 'createHousekeepingTask':
    case 'setTaskStatus': {
      const task = isObj(output.task) ? output.task : null;
      return task && typeof task.status === 'string'
        ? `Task ${task.status.replaceAll('_', ' ')}`
        : null;
    }
    default:
      return null;
  }
}

/**
 * Starting points shown in the command bar before anything is typed, one per kind of card the
 * agent can show. None names a guest, so they work on any day the demo data is seeded.
 */
export const suggestedQuestions = [
  'How does today look?',
  'Which rooms are free this weekend for two adults and a dog?',
  'Check in the first guest arriving today.',
  "What's still missing in the guest book for the first arrival today?",
  'How did the last 7 nights compare with the week before?',
  'Which rooms are dirty right now?',
  'The shower in room 307 drips, log it for maintenance.',
];
