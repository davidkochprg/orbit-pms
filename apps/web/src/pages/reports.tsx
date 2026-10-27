import type { Report, ReportDay } from '@orbit/shared';
import { ArrowDownRight, ArrowUpRight, ChevronRight, Minus } from 'lucide-react';
import { useMemo } from 'react';
import { useSearchParams } from 'react-router';
import { ErrorNotice } from '@/components/error-notice';
import { PageBody, PageHeader } from '@/components/page-header';
import { Section } from '@/components/section';
import { Segmented } from '@/components/segmented';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useBookingDrawer } from '@/hooks/use-booking-drawer';
import { useDayOverview, useReport } from '@/lib/api';
import { formatCzk, formatDate, formatRange, paymentMethodLabels } from '@/lib/format';
import {
  type Change,
  comparisonRange,
  isReportPeriod,
  percent,
  periodRange,
  pointChange,
  type ReportPeriod,
  reportPeriods,
  relativeChange,
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
  // Today comes from the API, so it is the hotel's date (Europe/Prague), not the browser's.
  const today = useDayOverview().data?.date;
  const range = useMemo(() => (today ? periodRange(period, today) : null), [period, today]);
  const previousRange = useMemo(() => range && comparisonRange(range), [range]);
  const report = useReport(range);
  const previous = useReport(previousRange);

  return (
    <>
      <PageHeader title="Reports" meta={range && formatRange(range.from, range.to)} />
      <PageBody>
        <div className="flex flex-col gap-8">
          <Segmented
            label="Period"
            value={period}
            options={reportPeriods}
            onChange={(p) => setParams({ period: p }, { replace: true })}
            className="max-w-full self-start overflow-x-auto"
          />
          {report.isError ? (
            <ErrorNotice message={report.error.message} />
          ) : !report.data ? (
            <div className="flex flex-col gap-6">
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                {[0, 1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-24" />
                ))}
              </div>
              <Skeleton className="h-56" />
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
  const ahead = period === 'next30';
  return (
    <div className="flex flex-col gap-10">
      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi
          label="Occupancy"
          value={`${percent(report.occupancy)}%`}
          detail={`${report.roomNightsSold} of ${report.roomNightsAvailable} room nights`}
          change={previous && pointChange(report.occupancy, previous.occupancy)}
          vs={vs}
        />
        <Kpi
          label="ADR"
          value={formatCzk(report.adr)}
          detail="Room revenue per room night sold"
          change={previous && relativeChange(report.adr, previous.adr)}
          vs={vs}
        />
        <Kpi
          label="RevPAR"
          value={formatCzk(report.revpar)}
          detail="Room revenue per available room night"
          change={previous && relativeChange(report.revpar, previous.revpar)}
          vs={vs}
        />
        <Kpi
          label="Room revenue"
          value={formatCzk(report.roomRevenue)}
          detail={ahead ? 'On the books' : 'Accommodation after discounts'}
          change={previous && relativeChange(report.roomRevenue, previous.roomRevenue)}
          vs={vs}
        />
      </dl>

      <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4 xl:grid-cols-7">
        <Figure label="Add-ons" value={formatCzk(report.addonRevenue)} />
        <Figure label="Extras" value={formatCzk(report.extrasRevenue)} />
        <Figure label="City tax" value={formatCzk(report.cityTax)} />
        <Figure label="Guest nights" value={report.guestNights} />
        <Figure label="Arrivals" value={report.arrivals} />
        <Figure label="Average stay" value={`${report.averageStay} nights`} />
        <Figure label="Cancellations" value={report.cancellations} />
      </dl>

      <Section title="Occupancy by night">
        <OccupancyChart days={report.days} />
      </Section>

      <div className="grid gap-x-10 gap-y-8 lg:grid-cols-2">
        <Section title="By room type">
          <ul className="flex flex-col gap-3">
            {report.byRoomType.map((t) => (
              <BarRow
                key={t.roomTypeId}
                label={t.roomTypeName}
                share={t.occupancy}
                value={`${percent(t.occupancy)}%`}
                detail={formatCzk(t.roomRevenue)}
              />
            ))}
          </ul>
        </Section>
        <Section title="By source">
          {report.bySource.length === 0 ? (
            <p className="text-sm text-muted-foreground">No stays in this period.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {report.bySource.map((s) => (
                <BarRow
                  key={s.source}
                  label={sourceLabels[s.source]}
                  share={s.roomNights / Math.max(report.roomNightsSold, 1)}
                  value={`${s.roomNights} nights`}
                  detail={formatCzk(s.roomRevenue)}
                />
              ))}
            </ul>
          )}
        </Section>
        <Section title="Payments received">
          <PropertyRows
            rows={[
              ...report.payments.map((p) => ({
                label: paymentMethodLabels[p.method],
                value: formatCzk(p.amount),
              })),
              {
                label: 'Total',
                value: formatCzk(report.payments.reduce((sum, p) => sum + p.amount, 0)),
                strong: true,
              },
            ]}
          />
        </Section>
        <UnpaidDepartures report={report} />
      </div>
    </div>
  );
}

function ChangeBadge({ change, vs }: { change: Change; vs: string }) {
  const Icon =
    change.direction === 'up' ? ArrowUpRight : change.direction === 'down' ? ArrowDownRight : Minus;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 text-xs tabular-nums',
        change.direction === 'up' && 'text-success',
        change.direction === 'down' && 'text-destructive',
        change.direction === 'flat' && 'text-muted-foreground',
      )}
      title={vs}
    >
      <Icon className="size-3.5" aria-hidden />
      {change.label}
      <span className="sr-only"> {vs}</span>
    </span>
  );
}

function Kpi({
  label,
  value,
  detail,
  change,
  vs,
}: {
  label: string;
  value: string;
  detail: string;
  change: Change | null | undefined;
  vs: string;
}) {
  return (
    <div className="flex flex-col gap-1.5 rounded-lg bg-surface-raised p-3 shadow-raised">
      <dt className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        {label}
        {change && <ChangeBadge change={change} vs={vs} />}
      </dt>
      <dd className="flex flex-col gap-0.5">
        <span className="text-xl font-semibold tracking-tight whitespace-nowrap tabular-nums sm:text-2xl">
          {value}
        </span>
        <span className="truncate text-xs text-muted-foreground">{detail}</span>
      </dd>
    </div>
  );
}

function Figure({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium tabular-nums">{value}</dd>
    </div>
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
            <span className="absolute -top-2 right-0 bg-background pl-1 text-[10px] text-subtle-foreground">
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
                    className="w-full rounded-t-[4px] bg-primary group-hover:bg-primary/80 group-focus-visible:ring-2 group-focus-visible:ring-ring"
                    style={{
                      height: `${Math.max(percent(d.occupancy), d.roomsSold > 0 ? 1 : 0)}%`,
                    }}
                  />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" className="flex flex-col gap-0.5">
                <span className="font-medium">{formatDate(d.date)}</span>
                <span className="tabular-nums">
                  {percent(d.occupancy)}% · {d.roomsSold} rooms · {formatCzk(d.roomRevenue)}
                </span>
              </TooltipContent>
            </Tooltip>
          ))}
        </div>
      </div>
      <div aria-hidden className="flex gap-[2px] pr-8 text-[10px] text-subtle-foreground">
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
              <td>{formatCzk(d.roomRevenue)}</td>
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
  detail,
}: {
  label: string;
  share: number;
  value: string;
  detail: string;
}) {
  return (
    <li className="flex flex-col gap-1">
      <div className="flex items-baseline gap-3 text-sm">
        <span className="min-w-0 flex-1 truncate">{label}</span>
        <span className="font-medium tabular-nums">{value}</span>
        <span className="w-28 shrink-0 text-right text-muted-foreground tabular-nums">
          {detail}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-primary-soft" aria-hidden>
        <div
          className="h-full rounded-full bg-primary"
          style={{ width: `${Math.min(share * 100, 100)}%` }}
        />
      </div>
    </li>
  );
}

function PropertyRows({ rows }: { rows: { label: string; value: string; strong?: boolean }[] }) {
  return (
    <div className="flex flex-col rounded-lg border">
      {rows.map((r) => (
        <div
          key={r.label}
          className={cn(
            'flex justify-between gap-4 border-b px-3 py-2 last:border-b-0',
            r.strong && 'font-medium',
          )}
        >
          <span className={cn(!r.strong && 'text-muted-foreground')}>{r.label}</span>
          <span className="tabular-nums">{r.value}</span>
        </div>
      ))}
    </div>
  );
}

function UnpaidDepartures({ report }: { report: Report }) {
  const { open } = useBookingDrawer();
  const total = report.unpaidDepartures.reduce((sum, u) => sum + u.balance, 0);
  return (
    <Section title="Left without paying" count={report.unpaidDepartures.length}>
      {report.unpaidDepartures.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Every guest who left in this period has settled their bill.
        </p>
      ) : (
        <ul className="-mx-2 flex flex-col">
          {report.unpaidDepartures.map((u) => (
            <li key={u.bookingId}>
              <button
                type="button"
                onClick={() => open(u.bookingId)}
                className="flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate">{u.guestName}</span>
                  <span className="text-xs text-muted-foreground">
                    Room {u.roomName}, left {formatDate(u.checkOut)}
                  </span>
                </span>
                <span className="font-medium tabular-nums">{formatCzk(u.balance)}</span>
                <ChevronRight className="size-4 text-muted-foreground" />
              </button>
            </li>
          ))}
          <li className="flex justify-between px-2 pt-2 text-sm text-muted-foreground">
            <span>Total open</span>
            <span className="tabular-nums">{formatCzk(total)}</span>
          </li>
        </ul>
      )}
    </Section>
  );
}
