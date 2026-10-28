import { createContext, useContext } from 'react';
import type { Entity } from '@/lib/agent-answer';

/** What the agent's tools returned about bookings, rooms and guests in this conversation. */
export const AgentEntitiesContext = createContext<Map<string, Entity>>(new Map());

/** A booking, room or guest the agent's tools described, if they did. */
export function useAgentEntity(id: string): Entity | undefined {
  return useContext(AgentEntitiesContext).get(id);
}
