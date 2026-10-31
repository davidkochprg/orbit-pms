import type { NightOutlook } from '@orbit/shared';
import { useRef, useState } from 'react';
import { ArrivalRisks } from '@/components/arrival-risks';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { ErrorNotice } from '@/components/error-notice';
import { LocalEvents } from '@/components/local-events';
import { Panel } from '@/components/panel';
import { RateCalendar } from '@/components/rate-calendar';
import { RateNightPanel } from '@/components/rate-night-panel';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { useAdjustRates, useHealth, useRevenueBrief, useRevenueOutlook } from '@/lib/api';
import { formatDate, formatLongDate } from '@/lib/format';
import { occupancy, signed, suggestions } from '@/lib/revenue';

const DAYS = 60;
/** Nights the summary row averages over. */
const WEEK = 7;

/**
 * The next 60 nights: how full each is, the rate suggested from demand, events and the forecast,
 * and why; a manager takes suggestions one night at a time or all at once. Below, the events behind
 * them and this week's arrivals most likely not to come.
 */
export function RateOutlook({ canManage }: { canManage: boolean }) {
  const outlook = useRevenueOutlook(DAYS);
  const adjust = useAdjustRates();
  const brief = useRevenueBrief();
  const aiOn = useHealth().data?.ai.configured ?? false;
  const { toast } = useToast();
  const [picked, setPicked] = useState<string | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);
  const nightPanel = useRef<HTMLElement>(null);

  if (outlook.isError) return <ErrorNotice message={outlook.error.message} />;
  if (!outlook.data) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-20 rounded-card" />
        <Skeleton className="h-[34rem] rounded-card" />
      </div>
    );
  }

  const { nights, events, arrivalRisks, today, weatherAvailable } = outlook.data;
  const toApply = suggestions(nights);
  const selected = nights.find((n) => n.date === picked) ?? toApply[0] ?? nights[0] ?? null;
  const week = nights.slice(0, WEEK);
  const weekShare = week.reduce((sum, n) => sum + occupancy(n), 0) / Math.max(week.length, 1);
  const weekNoShows = week.reduce((sum, n) => sum + n.expectedNoShows, 0);

  /** Sets nights and says so, with Undo back to what they were. */
  function set(changes: NightOutlook[], percent: (n: NightOutlook) => number) {
    const before = changes.map((n) => ({ date: n.date, percent: n.currentPercent }));
    adjust.mutate(
      { nights: changes.map((n) => ({ date: n.date, percent: percent(n) })) },
      {
        onSuccess: () =>
          toast({
            title:
              changes.length === 1
                ? `${formatDate(changes[0]!.date)} set to ${signed(percent(changes[0]!))}`
                : `Rates set for ${changes.length} nights`,
            action: { label: 'Undo', run: () => adjust.mutate({ nights: before }) },
          }),
      },
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <Stat
          label="Nights to review"
          value={String(toApply.length)}
          note="Suggested rate differs"
        />
        <Stat
          label="Next 7 nights"
          value={`${Math.round(weekShare * 100)}%`}
          note="Booked on average"
        />
        <Stat
          label="Likely no-shows"
          value={String(Math.round(weekNoShows))}
          note="Rooms, next 7 nights"
        />
      </div>

      {(brief.data || brief.isError) && (
        <Panel title="Summary">
          {brief.isError ? (
            <ErrorNotice message={brief.error.message} className="m-2" />
          ) : (
            <p className="max-w-3xl px-3 py-2.5 text-[0.8125rem] leading-relaxed">
              {brief.data?.text}
            </p>
          )}
        </Panel>
      )}

      {adjust.error && (
        <ErrorNotice message={adjust.error.message} onDismiss={() => adjust.reset()} />
      )}

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <Panel
          title={`Next ${DAYS} nights`}
          actions={
            <>
              <span className="mr-1 text-xs text-subtle-foreground max-md:hidden">
                {weatherAvailable ? 'Forecast by Open-Meteo' : 'No forecast'}
              </span>
              {aiOn && (
                <Button
                  variant="ghost"
                  size="xs"
                  disabled={brief.isPending}
                  onClick={() => brief.mutate(DAYS)}
                >
                  {brief.isPending ? 'Reading the outlook…' : 'Summarize'}
                </Button>
              )}
              {canManage && toApply.length > 0 && (
                <Button size="xs" disabled={adjust.isPending} onClick={() => setConfirmAll(true)}>
                  Apply {toApply.length} suggestion{toApply.length === 1 ? '' : 's'}
                </Button>
              )}
            </>
          }
        >
          <RateCalendar
            nights={nights}
            selected={selected?.date ?? null}
            onSelect={(date, via) => {
              setPicked(date);
              // Below the calendar on narrower screens: bring a clicked night into view.
              if (via === 'click' && !window.matchMedia('(min-width: 80rem)').matches) {
                nightPanel.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
              }
            }}
          />
        </Panel>
        {selected && (
          <Panel
            ref={nightPanel}
            title={formatLongDate(selected.date)}
            className="scroll-mt-4 xl:sticky xl:top-0"
          >
            <RateNightPanel
              key={selected.date}
              night={selected}
              canManage={canManage}
              busy={adjust.isPending}
              onSet={(percent) => set([selected], () => percent)}
            />
          </Panel>
        )}
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Panel title="Local events" count={events.length}>
          <LocalEvents events={events} canManage={canManage} today={today} />
        </Panel>
        <Panel title="Arrivals at risk" count={arrivalRisks.length}>
          <ArrivalRisks risks={arrivalRisks} />
        </Panel>
      </div>

      <ConfirmDialog
        open={confirmAll}
        onOpenChange={setConfirmAll}
        title={`Apply ${toApply.length} suggested rate${toApply.length === 1 ? '' : 's'}?`}
        description={
          <ul className="flex max-h-60 flex-col gap-0.5 overflow-auto">
            {toApply.map((n) => (
              <li key={n.date} className="flex justify-between gap-4 text-[0.8125rem]">
                <span>{formatDate(n.date)}</span>
                <span className="font-mono text-xs">
                  {signed(n.currentPercent)} → {signed(n.suggestedPercent)}
                </span>
              </li>
            ))}
          </ul>
        }
        confirmLabel="Apply"
        cancelLabel="Cancel"
        busy={adjust.isPending}
        onConfirm={() => {
          set(toApply, (n) => n.suggestedPercent);
          setConfirmAll(false);
        }}
      />
    </div>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-card bg-surface-sunken p-3 ring-1 ring-ink/5 ring-inset sm:p-4">
      <span className="truncate text-xs text-muted-foreground sm:text-[0.8125rem]">{label}</span>
      <span className="text-xl font-medium tracking-tight tabular-nums sm:text-2xl">{value}</span>
      <span className="truncate text-xs text-subtle-foreground max-sm:hidden">{note}</span>
    </div>
  );
}
