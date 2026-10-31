import type { Report } from '@orbit/shared';
import { ChartColumn } from 'lucide-react';
import { useNavigate } from 'react-router';
import { AgentCard, AgentCardHeader } from '@/components/agent-card';
import { ChangeBadge } from '@/components/change-badge';
import { Button } from '@/components/ui/button';
import { useCommandPalette } from '@/hooks/use-command-palette';
import { formatDate, formatMoney, formatRange } from '@/lib/format';
import { type Change, percent, pointChange, relativeChange } from '@/lib/reports';
import { Tip } from '@/components/ui/tooltip';

/**
 * A report the agent ran: occupancy, ADR, RevPAR and room revenue, a bar per night, and, when it
 * also ran the period before to compare, the change against it.
 */
export function ReportCard({ report, previous }: { report: Report; previous: Report | null }) {
  const navigate = useNavigate();
  const { closePalette } = useCommandPalette();
  const vs = previous ? `vs ${formatRange(previous.from, previous.to)}` : '';
  const tiles: { label: string; value: string; change: Change | null }[] = [
    {
      label: 'Occupancy',
      value: `${percent(report.occupancy)}%`,
      change: previous && pointChange(report.occupancy, previous.occupancy),
    },
    {
      label: 'ADR',
      value: formatMoney(report.adr),
      change: previous && relativeChange(report.adr, previous.adr),
    },
    {
      label: 'RevPAR',
      value: formatMoney(report.revpar),
      change: previous && relativeChange(report.revpar, previous.revpar),
    },
    {
      label: 'Room revenue',
      value: formatMoney(report.roomRevenue),
      change: previous && relativeChange(report.roomRevenue, previous.roomRevenue),
    },
  ];
  return (
    <AgentCard>
      <AgentCardHeader
        icon={ChartColumn}
        title={formatRange(report.from, report.to)}
        aside={
          <Button
            variant="ghost"
            size="xs"
            className="-my-1 shrink-0"
            onClick={() => {
              closePalette();
              void navigate('/reports');
            }}
          >
            Open reports
          </Button>
        }
      />
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {tiles.map((t) => (
          <div key={t.label} className="flex flex-col gap-0.5 rounded-control bg-ink/4 px-2.5 py-2">
            <dt className="flex items-center justify-between gap-1 text-xs text-muted-foreground">
              {t.label}
              {t.change && <ChangeBadge change={t.change} vs={vs} />}
            </dt>
            <dd className="font-mono text-base whitespace-nowrap tabular-nums">{t.value}</dd>
          </div>
        ))}
      </dl>
      {report.days.length > 1 && <NightBars days={report.days} />}
      {previous && <p className="text-xs text-muted-foreground">Changes are {vs}.</p>}
    </AgentCard>
  );
}

/** Occupancy per night as small bars; the numbers are in the tiles and on Reports. */
function NightBars({ days }: { days: Report['days'] }) {
  const first = days[0]!;
  const last = days.at(-1)!;
  return (
    <figure className="flex flex-col gap-1">
      <div
        role="img"
        aria-label={`Occupancy by night, from ${percent(Math.min(...days.map((d) => d.occupancy)))}% to ${percent(Math.max(...days.map((d) => d.occupancy)))}%`}
        className="flex h-12 items-end gap-px border-b border-border"
      >
        {days.map((d) => (
          <Tip key={d.date} label={`${formatDate(d.date)}: ${percent(d.occupancy)}%`}>
            <span
              className="min-w-0 flex-1 rounded-t-[3px] bg-linear-to-b from-primary to-accent-violet/70 opacity-75"
              style={{ height: `${Math.max(percent(d.occupancy), d.roomsSold > 0 ? 2 : 0)}%` }}
            />
          </Tip>
        ))}
      </div>
      <figcaption className="flex justify-between text-[10px] text-subtle-foreground">
        <span>{formatDate(first.date)}</span>
        <span>{formatDate(last.date)}</span>
      </figcaption>
    </figure>
  );
}
