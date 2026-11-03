import type { Report, ReportDay, ReportWeekday } from '@orbit/shared';
import { ChevronRight } from 'lucide-react';
import { useMemo } from 'react';
import { useSearchParams } from 'react-router';
import { ChangeBadge } from '@/components/change-badge';
import { ErrorNotice } from '@/components/error-notice';
import { PageBody, PageHeader } from '@/components/page-header';
import { Panel } from '@/components/panel';
import { Segmented } from '@/components/segmented';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger, Tip } from '@/components/ui/tooltip';
import { useBookingDrawer } from '@/hooks/use-booking-drawer';
import { usePageAgentContext } from '@/hooks/use-command-palette';
import { rangeId } from '@/lib/agent-context';
import { addDaysIso } from '@/lib/tape-chart';
import { useDayOverview, useHealth, usePricing, useReport, useReportSummary } from '@/lib/api';
import { Button } from '@/components/ui/button';
import {
  formatCount,
  formatMoney,
  formatDate,
  formatRange,
  paymentMethodLabels,
} from '@/lib/format';
import {
  type Change,
  comparisonRange,
  isoWeekdayNames,
  isReportPeriod,
  percent,
  periodRange,
  pointChange,
  type ReportPeriod,
  reportPeriods,
  relativeChange,
  stayLengthLabel,
} from '@/lib/reports';
import { cn } from '@/lib/utils';

const sourceLabels = {
  email: 'Email',
  phone: 'Phone',
  web: 'Website',
  ota: 'OTA',
  walk_in: 'Walk-in',
} as const;

export function ReportsPage() {
  const [params, setParams] = useSearchParams();
  const raw = params.get('period');
  const period: ReportPeriod = isReportPeriod(raw) ? raw : 'last30';
  // Today comes from the API, so it is the hotel's date in its time zone, not the browser's.
  const today = useDayOverview().data?.date;
  const range = useMemo(() => (today ? periodRange(period, today) : null), [period, today]);
  const previousRange = useMemo(() => range && comparisonRange(range), [range]);
  // The period's last night is the day before `to`.
  usePageAgentContext(
    range && { kind: 'report', id: rangeId(range.from, addDaysIso(range.to, -1)) },
  );
  const report = useReport(range);
  const previous = useReport(previousRange);
  const summary = useReportSummary();
  const aiOn = useHealth().data?.ai.configured ?? false;
  const choose = (p: ReportPeriod) => {
    // A summary is about the period it was written for.
    summary.reset();
    setParams({ period: p }, { replace: true });
  };

  return (
    <>
      <PageHeader
        title="Reports"
        meta={range && formatRange(range.from, range.to)}
        actions={
          <>
            <Segmented
              label="Period"
              size="sm"
              value={period}
              options={reportPeriods}
              onChange={choose}
              className="max-md:hidden"
            />
            {/* NativeSelect wraps itself in a div, so hide the wrapper. */}
            <div className="md:hidden">
              <Select
                aria-label="Period"
                value={period}
                onValueChange={(value) => isReportPeriod(value) && choose(value)}
                className="h-8 w-40"
              >
                {reportPeriods.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </Select>
            </div>
            {aiOn && (
              <Button
                variant="outline"
                size="sm"
                disabled={!range || summary.isPending}
                onClick={() => range && summary.mutate(range)}
              >
                {summary.isPending ? 'Reading the report…' : 'Summarize'}
              </Button>
            )}
          </>
        }
      />
      <PageBody>
        <div className="flex flex-col gap-4">
          {(summary.data || summary.isError) && (
            <Panel title="Summary">
              {summary.isError ? (
                <ErrorNotice message={summary.error.message} className="m-2" />
              ) : (
                <p className="max-w-3xl px-3 py-2.5 text-[0.8125rem] leading-relaxed">
                  {summary.data?.text}
                </p>
              )}
            </Panel>
          )}
          {report.isError ? (
            <ErrorNotice message={report.error.message} />
          ) : !report.data ? (
            <div className="flex flex-col gap-4">
              <Skeleton className="h-28 rounded-card" />
              <Skeleton className="h-64 rounded-card" />
            </div>
          ) : (
            <ReportView report={report.data} previous={previous.data} period={period} />
          )}
        </div>
      </PageBody>
    </>
  );
}

function ReportView({
  report,
  previous,
  period,
}: {
  report: Report;
  previous: Report | undefined;
  period: ReportPeriod;
}) {
  const vs = `vs the ${report.nights} nights before`;
  const cityTax = usePricing().data?.cityTax;
  const cityTaxLabel = cityTax?.label ?? 'City tax';
  // A fee the hotel doesn't charge is noise; one it charged in the period still shows.
  const showCityTax = (cityTax?.perPersonPerNight ?? 0) > 0 || report.cityTax > 0;
  const ahead = period === 'next30';
  return (
    <div className="flex flex-col gap-4">
      <Panel title="Performance" contentClassName="p-0">
        <dl className="grid grid-cols-2 lg:grid-cols-4">
          <Kpi
            label="Occupancy"
            value={`${percent(report.occupancy)}%`}
            detail={`${formatCount(report.roomNightsSold)} of ${formatCount(report.roomNightsAvailable)} room nights`}
            change={previous && pointChange(report.occupancy, previous.occupancy)}
            vs={vs}
          />
          <Kpi
            label="ADR"
            value={formatMoney(report.adr)}
            hint="Room revenue per room night sold"
            change={previous && relativeChange(report.adr, previous.adr)}
            vs={vs}
          />
          <Kpi
            label="RevPAR"
            value={formatMoney(report.revpar)}
            hint="Room revenue per available room night"
            change={previous && relativeChange(report.revpar, previous.revpar)}
            vs={vs}
          />
          <Kpi
            label="Room revenue"
            value={formatMoney(report.roomRevenue)}
            detail={ahead ? 'On the books' : undefined}
            change={previous && relativeChange(report.roomRevenue, previous.roomRevenue)}
            vs={vs}
          />
        </dl>

        <dl className="grid grid-cols-2 gap-x-6 gap-y-4 border-t px-5 py-4 sm:grid-cols-4 xl:grid-cols-7">
          <Figure
            label="TRevPAR"
            hint="Room, add-on and extras revenue per available room night"
            value={formatMoney(report.trevpar)}
          />
          <Figure label="Add-ons" value={formatMoney(report.addonRevenue)} />
          <Figure label="Extras" value={formatMoney(report.extrasRevenue)} />
          {showCityTax && <Figure label={cityTaxLabel} value={formatMoney(report.cityTax)} />}
          <Figure label="Guest nights" value={formatCount(report.guestNights)} />
          <Figure label="Arrivals" value={formatCount(report.arrivals)} />
          <Figure label="Average stay" value={`${report.averageStay} nights`} />
        </dl>
      </Panel>

      <Panel title="Occupancy by night" contentClassName="px-4 pt-6 pb-3">
        <OccupancyChart days={report.days} />
      </Panel>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Panel title="By weekday">
          <WeekdayChart weekdays={report.byWeekday} />
        </Panel>
        <GuestMix report={report} previous={previous} vs={vs} />
        <Panel title="By room type">
          <ul className="flex flex-col gap-4 p-4">
            {report.byRoomType.map((t) => (
              <BarRow
                key={t.roomTypeId}
                label={t.roomTypeName}
                share={t.occupancy}
                value={`${percent(t.occupancy)}%`}
                rate={t.roomNights > 0 ? formatMoney(t.adr) : '–'}
                detail={formatMoney(t.roomRevenue)}
              />
            ))}
          </ul>
        </Panel>
        <Panel title="By source">
          {report.bySource.length === 0 ? (
            <p className="p-3.5 text-sm text-muted-foreground">No stays in this period.</p>
          ) : (
            <ul className="flex flex-col gap-4 p-4">
              {report.bySource.map((s) => {
                const share = s.roomNights / Math.max(report.roomNightsSold, 1);
                return (
                  <BarRow
                    key={s.source}
                    label={sourceLabels[s.source]}
                    share={share}
                    value={`${percent(share)}%`}
                    rate={formatMoney(s.adr)}
                    detail={formatMoney(s.roomRevenue)}
                  />
                );
              })}
            </ul>
          )}
        </Panel>
        <Panel title="Payments received" contentClassName="p-0">
          <PropertyRows
            rows={[
              ...report.payments.map((p) => ({
                label: paymentMethodLabels[p.method],
                value: formatMoney(p.amount),
              })),
              {
                label: 'Total',
                value: formatMoney(report.payments.reduce((sum, p) => sum + p.amount, 0)),
                strong: true,
              },
            ]}
          />
        </Panel>
        <UnpaidDepartures report={report} />
      </div>
    </div>
  );
}

function Kpi({
  label,
  hint,
  value,
  detail,
  change,
  vs,
}: {
  label: string;
  /** What the label stands for, as a tooltip. */
  hint?: string;
  value: string;
  detail?: string;
  change: Change | null | undefined;
  vs: string;
}) {
  return (
    <div className="flex flex-col gap-2 border-border p-5 max-lg:odd:border-r max-lg:nth-[-n+2]:border-b lg:not-last:border-r">
      <dt className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
        <Tip label={hint}>
          <span>{label}</span>
        </Tip>
        {change && <ChangeBadge change={change} vs={vs} />}
      </dt>
      <dd className="flex flex-col gap-0.5">
        <span className="text-xl font-semibold tracking-tight whitespace-nowrap tabular-nums sm:text-2xl 2xl:text-3xl">
          {value}
        </span>
        {detail && <span className="truncate text-xs text-muted-foreground">{detail}</span>}
      </dd>
    </div>
  );
}

function Figure({
  label,
  hint,
  value,
  detail,
}: {
  label: string;
  /** What the label stands for, as a tooltip. */
  hint?: string;
  value: string | number;
  detail?: string;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">
        <Tip label={hint}>
          <span>{label}</span>
        </Tip>
      </dt>
      <dd className="font-mono text-[0.8125rem]">{value}</dd>
      {detail && <dd className="truncate text-xs text-muted-foreground">{detail}</dd>}
    </div>
  );
}

/**
 * Each weekday of the period side by side: how full it ran, as a bar, and its average rate.
 * Hover or focus a day for its RevPAR.
 */
function WeekdayChart({ weekdays }: { weekdays: ReportWeekday[] }) {
  return (
    <figure className="grid grid-cols-7 gap-2 px-4 pt-4 pb-3">
      {weekdays.map((w) => (
        <Tooltip key={w.weekday}>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label={`${isoWeekdayNames[w.weekday]}: ${percent(w.occupancy)}%, ADR ${w.roomNights > 0 ? formatMoney(w.adr) : 'none'}`}
              className="group flex min-w-0 flex-col items-center gap-1.5 rounded-control outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="font-mono text-xs tabular-nums">{percent(w.occupancy)}%</span>
              <span className="relative h-32 w-full max-w-12 overflow-hidden rounded-[5px] bg-ink/5">
                <span
                  className="absolute inset-x-0 bottom-0 rounded-t-[5px] bg-linear-to-b from-primary to-accent-violet/70 opacity-75 shadow-[inset_0_1px_0_rgb(255_255_255/0.25)] transition-opacity duration-150 ease-snap group-hover:opacity-100"
                  style={{ height: `${Math.min(percent(w.occupancy), 100)}%` }}
                />
              </span>
              <span className="text-xs text-muted-foreground">{isoWeekdayNames[w.weekday]}</span>
              <span className="font-mono text-[0.6875rem] text-muted-foreground tabular-nums">
                {w.roomNights > 0 ? formatMoney(w.adr) : '–'}
              </span>
            </button>
          </TooltipTrigger>
          <TooltipContent side="top" className="flex flex-col gap-0.5">
            <span className="font-medium">
              {isoWeekdayNames[w.weekday]} · {w.nights} {w.nights === 1 ? 'night' : 'nights'}
            </span>
            <span className="tabular-nums">
              {percent(w.occupancy)}% · ADR {formatMoney(w.adr)} · RevPAR {formatMoney(w.revpar)}
            </span>
          </TooltipContent>
        </Tooltip>
      ))}
    </figure>
  );
}

/** Who stayed: returning guests, families, cancellations and how long stays ran. */
function GuestMix({
  report,
  previous,
  vs,
}: {
  report: Report;
  previous: Report | undefined;
  vs: string;
}) {
  const returning = report.arrivals > 0 ? report.returningArrivals / report.arrivals : 0;
  const before =
    previous && previous.arrivals > 0 ? previous.returningArrivals / previous.arrivals : null;
  return (
    <Panel title="Guests" contentClassName="p-0">
      <dl className="grid grid-cols-3 gap-x-6 border-b px-4 py-3">
        <div className="flex flex-col gap-0.5">
          <dt className="flex items-center gap-2 text-xs text-muted-foreground">
            Returning
            {before !== null && report.arrivals > 0 && (
              <ChangeBadge change={pointChange(returning, before)} vs={vs} />
            )}
          </dt>
          <dd className="font-mono text-[0.8125rem]">{percent(returning)}%</dd>
          <dd className="truncate text-xs text-muted-foreground">
            {formatCount(report.returningArrivals)} of {formatCount(report.arrivals)} arrivals
          </dd>
        </div>
        <Figure
          label="With children"
          value={formatCount(report.arrivalsWithChildren)}
          detail={
            report.arrivals > 0
              ? `${percent(report.arrivalsWithChildren / report.arrivals)}% of arrivals`
              : undefined
          }
        />
        <Figure
          label="Cancelled"
          value={`${percent(report.cancellationRate)}%`}
          detail={`${formatCount(report.cancellations)} ${report.cancellations === 1 ? 'booking' : 'bookings'}`}
        />
      </dl>
      {report.arrivals === 0 ? (
        <p className="p-3.5 text-sm text-muted-foreground">No arrivals in this period.</p>
      ) : (
        <ul aria-label="Stays by length" className="flex flex-col gap-4 p-4">
          {report.stayLengths.map((s) => (
            <BarRow
              key={s.minNights}
              label={stayLengthLabel(s)}
              share={s.arrivals / report.arrivals}
              value={`${percent(s.arrivals / report.arrivals)}%`}
              detail={`${formatCount(s.arrivals)} ${s.arrivals === 1 ? 'arrival' : 'arrivals'}`}
            />
          ))}
        </ul>
      )}
    </Panel>
  );
}

/** One bar per night, height = occupancy. Hover or focus a bar for its numbers. */
function OccupancyChart({ days }: { days: ReportDay[] }) {
  // Label about six nights along the axis, whatever the period's length.
  const every = Math.max(1, Math.ceil(days.length / 6));
  return (
    <figure className="flex flex-col gap-1.5">
      <div className="relative h-48">
        {[1, 0.5].map((line) => (
          <div
            key={line}
            aria-hidden
            className="absolute inset-x-0 border-t border-dashed border-border"
            style={{ bottom: `${line * 100}%` }}
          >
            <span className="absolute -top-2 right-0 bg-background pl-1 font-mono text-[0.625rem] text-subtle-foreground">
              {line * 100}%
            </span>
          </div>
        ))}
        <div className="absolute inset-0 flex items-end gap-[2px] border-b border-border-strong pr-8">
          {days.map((d) => (
            <Tooltip key={d.date}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label={`${formatDate(d.date)}: ${percent(d.occupancy)}%`}
                  className="group flex h-full min-w-0 flex-1 items-end outline-none"
                >
                  <span
                    className="w-full rounded-t-[5px] bg-linear-to-b from-primary to-accent-violet/70 opacity-75 shadow-[inset_0_1px_0_rgb(255_255_255/0.25)] transition-opacity duration-150 ease-snap group-hover:opacity-100 group-focus-visible:opacity-100 group-focus-visible:ring-2 group-focus-visible:ring-ring"
                    style={{
                      height: `${Math.max(percent(d.occupancy), d.roomsSold > 0 ? 1 : 0)}%`,
                    }}
                  />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" className="flex flex-col gap-0.5">
                <span className="font-medium">{formatDate(d.date)}</span>
                <span className="tabular-nums">
                  {percent(d.occupancy)}% · {d.roomsSold} rooms · {formatMoney(d.roomRevenue)}
                </span>
              </TooltipContent>
            </Tooltip>
          ))}
        </div>
      </div>
      <div aria-hidden className="flex gap-[2px] pr-8 text-[0.625rem] text-subtle-foreground">
        {days.map((d, i) => (
          <span key={d.date} className="min-w-0 flex-1 overflow-visible whitespace-nowrap">
            {i % every === 0 ? formatDate(d.date).replace(/^\w+ /, '') : ''}
          </span>
        ))}
      </div>
      <table className="sr-only">
        <caption>Occupancy by night</caption>
        <thead>
          <tr>
            <th>Night</th>
            <th>Occupancy</th>
            <th>Rooms sold</th>
            <th>Room revenue</th>
          </tr>
        </thead>
        <tbody>
          {days.map((d) => (
            <tr key={d.date}>
              <td>{formatDate(d.date)}</td>
              <td>{percent(d.occupancy)}%</td>
              <td>{d.roomsSold}</td>
              <td>{formatMoney(d.roomRevenue)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

function BarRow({
  label,
  share,
  value,
  rate,
  detail,
}: {
  label: string;
  share: number;
  value: string;
  /** The slice's ADR. */
  rate?: string;
  detail: string;
}) {
  return (
    <li className="flex flex-col gap-1">
      <div className="flex items-baseline gap-3 text-sm">
        <span className="min-w-0 flex-1 truncate">{label}</span>
        <span className="font-medium tabular-nums">{value}</span>
        {rate !== undefined && (
          <Tip label="ADR">
            <span className="w-16 shrink-0 text-right text-muted-foreground tabular-nums">
              {rate}
            </span>
          </Tip>
        )}
        <span className="w-28 shrink-0 text-right text-muted-foreground tabular-nums">
          {detail}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-ink/6" aria-hidden>
        <div
          className="h-full rounded-full bg-linear-to-r from-accent-violet to-primary"
          style={{ width: `${Math.min(share * 100, 100)}%` }}
        />
      </div>
    </li>
  );
}

function PropertyRows({ rows }: { rows: { label: string; value: string; strong?: boolean }[] }) {
  return (
    <div className="flex flex-col">
      {rows.map((r) => (
        <div
          key={r.label}
          className={cn(
            'flex justify-between gap-4 border-b px-4 py-2.5 last:border-b-0',
            r.strong && 'font-medium',
          )}
        >
          <span className={cn(!r.strong && 'text-muted-foreground')}>{r.label}</span>
          <span className="font-mono text-[0.8125rem]">{r.value}</span>
        </div>
      ))}
    </div>
  );
}

function UnpaidDepartures({ report }: { report: Report }) {
  const { open } = useBookingDrawer();
  const total = report.unpaidDepartures.reduce((sum, u) => sum + u.balance, 0);
  return (
    <Panel title="Left without paying" count={report.unpaidDepartures.length}>
      {report.unpaidDepartures.length === 0 ? (
        <p className="p-3.5 text-sm text-muted-foreground">No unpaid departures</p>
      ) : (
        <ul className="flex flex-col">
          {report.unpaidDepartures.map((u) => (
            <li key={u.bookingId}>
              <button
                type="button"
                onClick={() => open(u.bookingId)}
                className="flex w-full items-center gap-3 rounded-control px-2.5 py-2 text-left outline-none transition-colors duration-150 ease-snap hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate">{u.guestName}</span>
                  <span className="text-xs text-muted-foreground">
                    Room {u.roomName}, left {formatDate(u.checkOut)}
                  </span>
                </span>
                <span className="font-mono text-[0.8125rem]">{formatMoney(u.balance)}</span>
                <ChevronRight className="size-4 text-muted-foreground" />
              </button>
            </li>
          ))}
          <li className="flex justify-between border-t px-2.5 pt-2.5 pb-1 text-sm text-muted-foreground">
            <span>Total open</span>
            <span className="tabular-nums">{formatMoney(total)}</span>
          </li>
        </ul>
      )}
    </Panel>
  );
}
