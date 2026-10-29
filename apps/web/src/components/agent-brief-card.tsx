import type { DailyBrief } from '@orbit/shared';
import { Sun } from 'lucide-react';
import { useState } from 'react';
import { AgentCard, AgentCardHeader } from '@/components/agent-card';
import { AttentionList } from '@/components/daily-brief';
import { Button } from '@/components/ui/button';
import { useCommandPalette } from '@/hooks/use-command-palette';
import { attentionItems, occupancyPercent } from '@/lib/brief';
import { formatDate } from '@/lib/format';

/** How many attention items show before "Show all". */
const ROWS = 4;

/** The day's brief the agent read: tonight's figures, then what needs attention, as on Today. */
export function BriefCard({ brief }: { brief: DailyBrief }) {
  const [all, setAll] = useState(false);
  const { closePalette, openBooking } = useCommandPalette();
  const items = attentionItems(brief);
  const shown = all ? items : items.slice(0, ROWS);
  const stats = [
    {
      label: 'Occupancy',
      value: `${occupancyPercent(brief.occupancy)}%`,
      detail: `${brief.occupancy.occupied} of ${brief.occupancy.sellable}`,
    },
    { label: 'Guests tonight', value: String(brief.guestsTonight) },
    { label: 'Arrivals', value: String(brief.arrivals) },
    { label: 'Departures', value: String(brief.departures) },
  ];
  return (
    <AgentCard>
      <AgentCardHeader
        icon={Sun}
        title={`Brief for ${formatDate(brief.date)}`}
        aside={
          <span className="text-xs text-muted-foreground tabular-nums">
            {items.length === 0 ? 'Nothing needs attention' : `${items.length} need attention`}
          </span>
        }
      />
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="flex flex-col gap-0.5 rounded-control bg-ink/4 px-2.5 py-2">
            <dt className="text-xs text-muted-foreground">{s.label}</dt>
            <dd className="flex items-baseline gap-1.5">
              <span className="font-mono text-base tabular-nums">{s.value}</span>
              {s.detail && (
                <span className="text-xs text-subtle-foreground tabular-nums">{s.detail}</span>
              )}
            </dd>
          </div>
        ))}
      </dl>
      {items.length > 0 && (
        <div className="-mx-1.5">
          <AttentionList items={shown} onOpen={closePalette} openBooking={openBooking} />
        </div>
      )}
      {items.length > ROWS && (
        <Button variant="ghost" size="xs" className="self-start" onClick={() => setAll((a) => !a)}>
          {all ? 'Show fewer' : `Show all ${items.length}`}
        </Button>
      )}
    </AgentCard>
  );
}
