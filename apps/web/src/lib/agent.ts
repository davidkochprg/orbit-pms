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

/** Starting points shown in the command bar before anything is typed. */
export const suggestedQuestions = [
  'Who arrives today, and do any of them bring children?',
  'Who still needs an ID in the guest book today?',
  'Which rooms are free this weekend for two adults?',
  'What does a week in the apartment cost for a family of four in August?',
];
