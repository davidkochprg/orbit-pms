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
