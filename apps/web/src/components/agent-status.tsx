import { StatusDot } from '@/components/status-dot';
import { useHealth } from '@/lib/api';

/** Whether the server is reachable and the agent is configured, as a dot and a short label. */
export function AgentStatus() {
  const health = useHealth();
  const [label, color] = health.isPending
    ? ['Connecting…', 'bg-subtle-foreground']
    : health.isError
      ? ['Server offline', 'bg-destructive']
      : health.data.ai.configured
        ? ['Agent ready', 'bg-success']
        : ['Agent not configured', 'bg-warning'];
  return (
    <span className="flex items-center gap-1.5">
      <StatusDot className={color} />
      {label}
    </span>
  );
}
