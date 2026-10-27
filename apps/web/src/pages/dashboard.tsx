import { BedDouble, LogIn, LogOut, Plus } from 'lucide-react';
import { BookingList } from '@/components/booking-list';
import { DailyBriefPanel } from '@/components/daily-brief';
import { ErrorNotice } from '@/components/error-notice';
import { PageBody, PageHeader } from '@/components/page-header';
import { Section } from '@/components/section';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useBookingEditor } from '@/hooks/use-booking-editor';
import { useDailyBrief, useDayOverview } from '@/lib/api';
import { formatDate, formatLongDate, formatParty } from '@/lib/format';

export function DashboardPage() {
  const day = useDayOverview();
  const brief = useDailyBrief();
  const { openNew } = useBookingEditor();

  return (
    <>
      <PageHeader
        title="Today"
        meta={day.data && formatLongDate(day.data.date)}
        actions={
          <Button size="sm" onClick={() => openNew()}>
            <Plus /> New booking
          </Button>
        }
      />
      <PageBody>
        <div className="flex flex-col gap-10">
          {brief.isError ? (
            <ErrorNotice message={brief.error.message} />
          ) : !brief.data ? (
            <div className="flex flex-col gap-8">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
                {[0, 1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="h-20" />
                ))}
              </div>
              <Skeleton className="h-40 w-full" />
            </div>
          ) : (
            <DailyBriefPanel brief={brief.data} />
          )}

          {day.isError ? (
            <ErrorNotice message={day.error.message} />
          ) : !day.data ? (
            <div className="grid gap-8 xl:grid-cols-3">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-64 w-full" />
              ))}
            </div>
          ) : (
            <div className="grid gap-x-10 gap-y-8 lg:grid-cols-2 2xl:grid-cols-3">
              <Section title="Arrivals" count={day.data.arrivals.length}>
                <BookingList rows={day.data.arrivals} empty="No arrivals today" emptyIcon={LogIn} />
              </Section>
              <Section title="Departures" count={day.data.departures.length}>
                <BookingList
                  rows={day.data.departures}
                  empty="No departures today"
                  emptyIcon={LogOut}
                />
              </Section>
              <Section title="In house" count={day.data.inHouse.length}>
                <BookingList
                  rows={day.data.inHouse}
                  empty="Nobody is staying tonight"
                  emptyIcon={BedDouble}
                  detail={({ booking }) =>
                    `${formatParty(booking.adults, booking.childAges)}, leaves ${formatDate(booking.checkOut)}`
                  }
                />
              </Section>
            </div>
          )}
        </div>
      </PageBody>
    </>
  );
}
