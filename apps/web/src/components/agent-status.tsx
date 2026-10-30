import { StatusDot } from '@/components/status-dot';
import { useHealth } from '@/lib/api';

/** Shows only when the server is unreachable or the agent isn't configured. */
export function AgentStatus() {
  const health = useHealth();
  if (health.isPending || (health.isSuccess && health.data.ai.configured)) return null;
  const [label, color] = health.isError
    ? ['Server offline', 'bg-destructive']
    : ['Agent not configured', 'bg-warning'];
  return (
    <span className="flex items-center gap-1.5">
      <StatusDot className={color} />
      {label}
    </span>
  );
}
