import {
  agentBookingRowSchema,
  agentRoomStatusResultSchema,
  agentTaskCreatedResultSchema,
  dailyBriefSchema,
  folioSchema,
  reportSchema,
  roomOptionSchema,
} from '@orbit/shared';
import type { ToolResult } from '@/lib/agent';
import { formatMoney, formatRange } from '@/lib/format';
import { addDaysIso } from '@/lib/tape-chart';

/** A next step offered under an answer: a question to ask, or a page to open. */
export type FollowUp = { label: string; ask: string } | { label: string; path: string };

const MAX = 3;

const ask = (question: string): FollowUp => ({ label: question, ask: question });

/**
 * The obvious next steps after what the agent just showed, worked out from its tool results, not
 * by the model: e.g. after the brief, the rooms still to prepare; after a bill with money due,
 * recording the payment. At most three, most useful first.
 */
export function followUps(results: ToolResult[]): FollowUp[] {
  const out: FollowUp[] = [];
  const names = new Set(results.map((r) => r.name));
  for (const { name, output } of results) {
    switch (name) {
      case 'getDailyBrief': {
        const brief = dailyBriefSchema.safeParse(output);
        if (!brief.success) break;
        const b = brief.data;
        if (b.roomsToPrepare.length > 0) {
          out.push(ask('Which rooms still need to be ready for arrivals?'));
        }
        if (b.missingIds.length > 0)
          out.push(ask('Who still needs an ID in the guest book today?'));
        if (b.unansweredMessages > 0) {
          out.push({ label: `Open the inbox (${b.unansweredMessages})`, path: '/inbox' });
        }
        if (b.holds.length > 0) out.push(ask('Which holds need a decision?'));
        break;
      }
      case 'checkAvailability': {
        const options = roomOptionSchema.array().safeParse(output);
        if (!options.success || options.data.length === 0) break;
        const { checkIn, checkOut } = options.data[0]!.quote;
        const next = formatRange(addDaysIso(checkIn, 7), addDaysIso(checkOut, 7));
        out.push(ask(`Which rooms are free ${next} for the same party?`));
        break;
      }
      case 'getReport': {
        const report = reportSchema.safeParse(output);
        if (!report.success) break;
        if (results.filter((r) => r.name === 'getReport').length === 1) {
          out.push(ask(`Compare with the ${report.data.nights} nights before`));
        }
        if (report.data.unpaidDepartures.length > 0) {
          out.push(ask('Who left without paying in full?'));
        }
        out.push(ask('Which booking sources brought the most room revenue?'));
        break;
      }
      case 'getBill': {
        const folio = folioSchema.safeParse(output);
        if (folio.success && folio.data.balance > 0) {
          out.push(ask(`Record the ${formatMoney(folio.data.balance)} balance as a card payment`));
        }
        break;
      }
      case 'getArrivals': {
        const rows = agentBookingRowSchema.array().safeParse(output);
        if (!rows.success || rows.data.length === 0) break;
        out.push(ask('Which arrivals still need an ID?'));
        out.push(ask("Which arrivals' rooms aren't ready yet?"));
        break;
      }
      case 'getDepartures': {
        const rows = agentBookingRowSchema.array().safeParse(output);
        if (rows.success && rows.data.length > 0) {
          out.push(ask('Who leaving today still owes money?'));
        }
        break;
      }
      case 'getHousekeeping':
        out.push(ask('Which dirty rooms have a guest arriving today?'));
        break;
      case 'setRoomStatus':
      case 'createHousekeepingTask':
        if (
          agentRoomStatusResultSchema.safeParse(output).success ||
          agentTaskCreatedResultSchema.safeParse(output).success
        ) {
          if (!names.has('getHousekeeping')) out.push(ask('Which rooms are still dirty?'));
        }
        break;
    }
  }
  const seen = new Set<string>();
  return out
    .filter((f) => {
      if (seen.has(f.label)) return false;
      seen.add(f.label);
      return true;
    })
    .slice(0, MAX);
}
