import type { NightOutlook } from '@orbit/shared';
import { Check, PanelRight, RotateCcw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { ArrivalRisks } from '@/components/arrival-risks';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { ErrorNotice } from '@/components/error-notice';
import { LocalEvents } from '@/components/local-events';
import { LogoMark } from '@/components/logo-mark';
import { Panel } from '@/components/panel';
import { RateCalendar } from '@/components/rate-calendar';
import { RateNightPanel } from '@/components/rate-night-panel';
import { Button } from '@/components/ui/button';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { useAskOrbit } from '@/hooks/use-ask-orbit';
import { usePageAgentContext } from '@/hooks/use-command-palette';
import { useToast } from '@/hooks/use-toast';
import {
  useAdjustRates,
  useHealth,
  useRateReview,
  useRevenueBrief,
  useRevenueOutlook,
} from '@/lib/api';
import { formatDate, formatLongDate, formatRecent } from '@/lib/format';
import { signed, suggestions } from '@/lib/revenue';

const DAYS = 60;

/**
 * The next 60 nights: how full each is, the rate suggested from demand, events, the forecast and
 * the model's review, and why; a manager takes suggestions one night at a time or all at once.
 * Beside them, or below on narrower screens, the events behind them and this week's arrivals most
 * likely not to come. With AI on, the outlook is reviewed again whenever what the review read has
 * changed.
 */
export function RateOutlook({ canManage }: { canManage: boolean }) {
  const outlook = useRevenueOutlook(DAYS);
  const adjust = useAdjustRates();
  const brief = useRevenueBrief();
  const review = useRateReview(DAYS);
  const aiOn = useHealth().data?.ai.configured ?? false;
  const { toast } = useToast();
  const ask = useAskOrbit();
  const [picked, setPicked] = useState<string | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);
  const nightPanel = useRef<HTMLElement>(null);

  // Each outlook is reviewed once: a failed review isn't retried until the outlook changes.
  const reviewed = useRef<string | null>(null);
  const stale = outlook.data && !outlook.data.review.current ? outlook.data.review.basis : null;
  const { mutate: runReview } = review;
  useEffect(() => {
    if (!aiOn || !stale || reviewed.current === stale) return;
    reviewed.current = stale;
    runReview();
  }, [aiOn, stale, runReview]);

  // The night in the panel, which a question from the command bar is about.
  const shownNight =
    picked ??
    (outlook.data && (suggestions(outlook.data.nights)[0] ?? outlook.data.nights[0])?.date);
  usePageAgentContext(shownNight ? { kind: 'night', id: shownNight } : null);

  if (outlook.isError) return <ErrorNotice message={outlook.error.message} />;
  if (!outlook.data) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-[34rem] rounded-card" />
      </div>
    );
  }

  const {
    nights,
    events,
    arrivalRisks,
    today,
    weatherAvailable,
    review: lastReview,
  } = outlook.data;
  const toApply = suggestions(nights);
  const selected = nights.find((n) => n.date === picked) ?? toApply[0] ?? nights[0] ?? null;

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
      {review.error && (
        <ErrorNotice message={review.error.message} onDismiss={() => review.reset()} />
      )}

      {/* Columns follow the page's width, not the window's, so an open sidebar counts. Wide: the
          calendar with arrivals under it, and the night with events beside it. Narrow: one column,
          with the night right under the calendar that picks it. */}
      <div className="@container">
        <div className="grid items-start gap-4 @5xl:grid-cols-[minmax(0,1fr)_21rem]">
          <div className="contents @5xl:flex @5xl:min-w-0 @5xl:flex-col @5xl:gap-4">
            <Panel
              className="order-1"
              title={`Next ${DAYS} nights`}
              actions={
                <>
                  <span
                    className="mr-1 text-xs text-subtle-foreground max-md:hidden"
                    aria-live="polite"
                  >
                    {review.isPending ? (
                      <span className="animate-pulse">Reviewing {DAYS} nights…</span>
                    ) : (
                      lastReview.reviewedAt && `Reviewed ${formatRecent(lastReview.reviewedAt)} · `
                    )}
                    {!review.isPending &&
                      (weatherAvailable ? 'Forecast by Open-Meteo' : 'No forecast')}
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
                    <Button
                      size="xs"
                      disabled={adjust.isPending}
                      onClick={() => setConfirmAll(true)}
                    >
                      Apply {toApply.length} suggestion{toApply.length === 1 ? '' : 's'}
                    </Button>
                  )}
                </>
              }
            >
              <RateCalendar
                nights={nights}
                selected={selected?.date ?? null}
                menu={(night, cell) => (
                  <ContextMenu>
                    <ContextMenuTrigger asChild>{cell}</ContextMenuTrigger>
                    <ContextMenuContent className="w-56">
                      <ContextMenuLabel>{formatDate(night.date)}</ContextMenuLabel>
                      <ContextMenuItem onSelect={() => setPicked(night.date)}>
                        <PanelRight /> Show this night
                      </ContextMenuItem>
                      {ask && (
                        <ContextMenuItem onSelect={() => ask({ kind: 'night', id: night.date })}>
                          <LogoMark /> Ask Orbit
                        </ContextMenuItem>
                      )}
                      {canManage && night.suggestedPercent !== night.currentPercent && (
                        <ContextMenuItem
                          disabled={adjust.isPending}
                          onSelect={() => set([night], (n) => n.suggestedPercent)}
                        >
                          <Check /> Take the suggestion, {signed(night.suggestedPercent)}
                        </ContextMenuItem>
                      )}
                      {canManage && night.currentPercent !== 0 && (
                        <ContextMenuItem
                          disabled={adjust.isPending}
                          onSelect={() => set([night], () => 0)}
                        >
                          <RotateCcw /> Go back to the season rate
                        </ContextMenuItem>
                      )}
                    </ContextMenuContent>
                  </ContextMenu>
                )}
                onSelect={(date, via) => {
                  setPicked(date);
                  // Below the calendar on narrower screens: bring a clicked night into view.
                  if (via === 'click') {
                    nightPanel.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                  }
                }}
              />
            </Panel>
            <Panel title="Arrivals at risk" count={arrivalRisks.length} className="order-4">
              <ArrivalRisks risks={arrivalRisks} />
            </Panel>
          </div>
          <div className="contents @5xl:flex @5xl:flex-col @5xl:gap-4">
            {selected && (
              <Panel
                ref={nightPanel}
                title={formatLongDate(selected.date)}
                className="order-2 scroll-mt-4"
                contentClassName="p-0"
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
            <Panel title="Local events" count={events.length} className="order-3">
              <LocalEvents events={events} canManage={canManage} today={today} />
            </Panel>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirmAll}
        onOpenChange={setConfirmAll}
        title={`Apply ${toApply.length} suggested rate${toApply.length === 1 ? '' : 's'}?`}
        description={
          <ul className="scroll-fade flex max-h-60 flex-col gap-0.5 overflow-auto">
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
