import type { ActivityItem, AuditActor } from '@orbit/shared';
import { History, UserRound } from 'lucide-react';
import { GuestAvatar } from '@/components/guest-avatar';
import { LogoMark } from '@/components/logo-mark';
import { Link, useSearchParams } from 'react-router';
import { EmptyState } from '@/components/empty-state';
import { ErrorNotice } from '@/components/error-notice';
import { PageBody, PageHeader } from '@/components/page-header';
import { Section } from '@/components/section';
import { Segmented } from '@/components/segmented';
import { Skeleton } from '@/components/ui/skeleton';
import { useBookingDrawer } from '@/hooks/use-booking-drawer';
import { activityDetail, activityLabel } from '@/lib/activity';
import { useActivity } from '@/lib/api';
import { displayRegion, formatLongDate } from '@/lib/format';

type Filter = 'all' | AuditActor;

const filters: { value: Filter; label: string }[] = [
  { value: 'all', label: 'Everything' },
  { value: 'user', label: 'Staff' },
  { value: 'agent', label: 'Orbit' },
];

/** The time of day in the hotel's time zone and clock: "3:30 PM" or "15:30". */
const time = {
  format: (d: Date) =>
    new Intl.DateTimeFormat(displayRegion().usDates ? 'en-US' : 'en-GB', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: displayRegion().usDates,
      timeZone: displayRegion().timeZone,
    }).format(d),
};
/** The hotel day an entry belongs to, as `YYYY-MM-DD`. */
const day = {
  format: (d: Date) =>
    new Intl.DateTimeFormat('en-CA', { timeZone: displayRegion().timeZone }).format(d),
};

/** Every change by staff or the agent, newest first, grouped by hotel day. */
export function ActivityPage() {
  const [params, setParams] = useSearchParams();
  const raw = params.get('actor');
  const filter: Filter = raw === 'user' || raw === 'agent' ? raw : 'all';
  const activity = useActivity(filter === 'all' ? undefined : filter);

  const groups = new Map<string, ActivityItem[]>();
  for (const item of activity.data ?? []) {
    const date = day.format(new Date(item.createdAt));
    groups.set(date, [...(groups.get(date) ?? []), item]);
  }

  return (
    <>
      <PageHeader
        title="Activity"
        meta="The latest 100 changes"
        actions={
          <Segmented
            label="Who"
            size="sm"
            value={filter}
            options={filters}
            onChange={(f) => setParams(f === 'all' ? {} : { actor: f }, { replace: true })}
          />
        }
      />
      <PageBody>
        <div className="flex max-w-3xl flex-col gap-8">
          {activity.isError ? (
            <ErrorNotice message={activity.error.message} />
          ) : !activity.data ? (
            <Skeleton className="h-96" />
          ) : activity.data.length === 0 ? (
            <EmptyState icon={History} title="Nothing yet" />
          ) : (
            [...groups].map(([date, items]) => (
              <Section key={date} title={formatLongDate(date)} count={items.length}>
                <ol className="-mx-2 flex flex-col">
                  {items.map((item) => (
                    <ActivityRow key={item.id} item={item} />
                  ))}
                </ol>
              </Section>
            ))
          )}
        </div>
      </PageBody>
    </>
  );
}

function ActivityRow({ item }: { item: ActivityItem }) {
  const byAgent = item.actor === 'agent';
  const detail = activityDetail(item.action, item.payload);
  return (
    <li className="flex items-start gap-3 rounded-lg px-2 py-2">
      {!byAgent && item.byName ? (
        <GuestAvatar name={item.byName} className="mt-0.5 shrink-0" />
      ) : (
        <span
          className={
            byAgent
              ? 'mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary-text'
              : 'mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground'
          }
          aria-hidden
        >
          {byAgent ? <LogoMark className="size-3.5" /> : <UserRound className="size-3.5" />}
        </span>
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex flex-wrap items-baseline gap-x-1.5">
          <span className="font-medium">{activityLabel(item.action)}</span>
          {item.subject && <Subject subject={item.subject} />}
        </span>
        <span className="truncate text-xs text-muted-foreground">
          {[byAgent ? 'Orbit' : (item.byName ?? 'Staff'), detail].filter(Boolean).join(' · ')}
        </span>
      </div>
      <time
        dateTime={item.createdAt}
        className="shrink-0 pt-0.5 text-xs text-muted-foreground tabular-nums"
      >
        {time.format(new Date(item.createdAt))}
      </time>
    </li>
  );
}

const linkClass =
  'truncate text-muted-foreground underline-offset-2 outline-none hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring';

function Subject({ subject }: { subject: NonNullable<ActivityItem['subject']> }) {
  const { open } = useBookingDrawer();
  switch (subject.kind) {
    case 'booking':
      return (
        <button type="button" onClick={() => open(subject.id)} className={linkClass}>
          {subject.label}
        </button>
      );
    case 'guest':
      return (
        <Link to={`/guests/${subject.id}`} className={linkClass}>
          {subject.label}
        </Link>
      );
    case 'inquiry':
      return (
        <Link to={`/inbox/${subject.id}`} className={linkClass}>
          {subject.label}
        </Link>
      );
    case 'room':
      return (
        <Link to="/housekeeping" className={linkClass}>
          {subject.label}
        </Link>
      );
    case 'room_type':
    case 'staff':
      return (
        <Link to={subject.kind === 'staff' ? '/settings/team' : '/rooms'} className={linkClass}>
          {subject.label}
        </Link>
      );
  }
}
