import type { AgentContext } from '@orbit/shared';
import { useCommandPalette } from '@/hooks/use-command-palette';
import { useHealth } from '@/lib/api';

/**
 * Opens a new conversation with the agent about something (a room, a repair, a night), or null
 * when the agent isn't configured, so its "Ask Orbit" entries hide like every other AI action.
 */
export function useAskOrbit(): ((context: AgentContext) => void) | null {
  const { openPalette } = useCommandPalette();
  const aiOn = useHealth().data?.ai.configured ?? false;
  return aiOn ? (context) => openPalette({ mode: 'agent', context }) : null;
}
