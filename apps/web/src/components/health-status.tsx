import { cn } from '@/lib/utils';
import { useHealth } from '@/lib/api';

function Dot({ ok }: { ok: boolean | undefined }) {
  return (
    <span
      className={cn(
        'inline-block size-2 rounded-full',
        ok === undefined ? 'bg-muted-foreground/40' : ok ? 'bg-primary' : 'bg-destructive',
      )}
    />
  );
}

export function HealthStatus() {
  const health = useHealth();
  const apiOk = health.isPending ? undefined : health.isSuccess;
  const aiOk = health.data?.ai.configured;
  return (
    <div className="flex flex-col gap-1 px-2 text-xs text-muted-foreground">
      <span className="flex items-center gap-2">
        <Dot ok={apiOk} /> API {health.isPending ? 'checking…' : apiOk ? 'online' : 'offline'}
      </span>
      <span className="flex items-center gap-2">
        <Dot ok={apiOk ? aiOk : undefined} /> AI {aiOk ? 'configured' : 'not configured'}
      </span>
    </div>
  );
}
