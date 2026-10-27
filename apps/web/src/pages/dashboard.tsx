import { BedDouble, LogIn, LogOut } from 'lucide-react';
import { BookingList } from '@/components/booking-list';
import { ErrorNotice } from '@/components/error-notice';
import { PageBody, PageHeader } from '@/components/page-header';
import { Section } from '@/components/section';
import { Skeleton } from '@/components/ui/skeleton';
import { useDayOverview } from '@/lib/api';
import { formatDate, formatLongDate, formatParty } from '@/lib/format';

export function DashboardPage() {
  const day = useDayOverview();

  return (
    <>
      <PageHeader title="Today" meta={day.data && formatLongDate(day.data.date)} />
      <PageBody>
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
      </PageBody>
    </>
  );
}
