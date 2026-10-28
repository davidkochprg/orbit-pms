import { BedDouble, LogIn, LogOut, Plus } from 'lucide-react';
import { BookingList } from '@/components/booking-list';
import { DailyBriefPanel } from '@/components/daily-brief';
import { ErrorNotice } from '@/components/error-notice';
import { PageBody, PageHeader } from '@/components/page-header';
import { Panel } from '@/components/panel';
import { TonightPanel } from '@/components/tonight-panel';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useBookingEditor } from '@/hooks/use-booking-editor';
import { useClockMinute } from '@/hooks/use-clock-minute';
import { useSession } from '@/hooks/use-session';
import { useDailyBrief, useDayOverview, useHousekeeping } from '@/lib/api';
import { formatDate, formatLongDate, formatParty } from '@/lib/format';
import { greeting } from '@/lib/house-map';

export function DashboardPage() {
  const day = useDayOverview();
  const brief = useDailyBrief();
  const board = useHousekeeping();
  const { current } = useSession();
  const minute = useClockMinute(true);
  const { openNew } = useBookingEditor();
  const firstName = current?.name.split(' ')[0];

  return (
    <>
      <PageHeader
        title="Today"
        actions={
          <Button size="sm" onClick={() => openNew()}>
            <Plus /> New booking
          </Button>
        }
      />
      <PageBody>
        <div className="mx-auto flex max-w-[90rem] flex-col gap-4">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1 px-1 pb-4">
              <h2 className="text-3xl font-semibold tracking-tight">
                {greeting(minute)}
                {firstName && `, ${firstName}`}
              </h2>
              <p className="text-base text-muted-foreground">
                {day.data ? formatLongDate(day.data.date) : ' '}
              </p>
            </div>
            {brief.isError ? (
              <ErrorNotice message={brief.error.message} />
            ) : !brief.data ? (
              <Skeleton className="h-80 w-full rounded-card" />
            ) : (
              <TonightPanel brief={brief.data} rooms={board.data?.rooms} />
            )}
          </div>

          {brief.data && <DailyBriefPanel brief={brief.data} />}

          {day.isError ? (
            <ErrorNotice message={day.error.message} />
          ) : !day.data ? (
            <div className="grid gap-8 xl:grid-cols-3">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-64 w-full rounded-card" />
              ))}
            </div>
          ) : (
            <div className="grid items-start gap-4 lg:grid-cols-2 2xl:grid-cols-3">
              <Panel title="Arrivals" count={day.data.arrivals.length}>
                <BookingList rows={day.data.arrivals} empty="No arrivals today" emptyIcon={LogIn} />
              </Panel>
              <Panel title="Departures" count={day.data.departures.length}>
                <BookingList
                  rows={day.data.departures}
                  empty="No departures today"
                  emptyIcon={LogOut}
                />
              </Panel>
              <Panel title="In house" count={day.data.inHouse.length}>
                <BookingList
                  rows={day.data.inHouse}
                  empty="Nobody is staying tonight"
                  emptyIcon={BedDouble}
                  detail={({ booking }) =>
                    `${formatParty(booking.adults, booking.childAges)}, leaves ${formatDate(booking.checkOut)}`
                  }
                />
              </Panel>
            </div>
          )}
        </div>
      </PageBody>
    </>
  );
}
