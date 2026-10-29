import { BedDouble, LogIn, LogOut, Plus } from 'lucide-react';
import { BookingList } from '@/components/booking-list';
import { AttentionPanel, GapsPanel } from '@/components/daily-brief';
import { ErrorNotice } from '@/components/error-notice';
import { PageBody, PageHeader } from '@/components/page-header';
import { Panel, ScrollBox } from '@/components/panel';
import { TonightPanel } from '@/components/tonight-panel';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useBookingEditor } from '@/hooks/use-booking-editor';
import { useDailyBrief, useDayOverview, useHousekeeping } from '@/lib/api';
import { formatDate, formatLongDate, formatParty } from '@/lib/format';

/**
 * The day on one screen: tonight's figures and house map with what needs attention beside them,
 * then today's arrivals, departures, guests in house and nights to sell. Long lists scroll in
 * their panels instead of the page.
 */
/** A list's box: a fixed height when the panels stack, the rest of the screen when they don't. */
const listBox = 'h-72 xl:absolute xl:inset-0 xl:h-auto';

export function DashboardPage() {
  const day = useDayOverview();
  const brief = useDailyBrief();
  const board = useHousekeeping();
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
        {/* On wide screens the lists below fill what is left of the screen. */}
        <div className="flex min-h-full flex-col gap-4">
          {brief.isError ? (
            <ErrorNotice message={brief.error.message} />
          ) : !brief.data ? (
            <Skeleton className="h-96 w-full rounded-card" />
          ) : (
            <div className="grid gap-4 xl:grid-cols-3">
              <TonightPanel
                brief={brief.data}
                day={day.data}
                rooms={board.data?.rooms}
                className="xl:col-span-2"
              />
              <AttentionPanel brief={brief.data} />
            </div>
          )}

          {day.isError ? (
            <ErrorNotice message={day.error.message} />
          ) : !day.data ? (
            <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-80 w-full rounded-card" />
              ))}
            </div>
          ) : (
            <div className="grid flex-1 gap-4 lg:grid-cols-2 xl:min-h-80 xl:grid-cols-4">
              <Panel title="Arrivals" count={day.data.arrivals.length} contentClassName="p-0">
                <ScrollBox className={listBox}>
                  <BookingList
                    rows={day.data.arrivals}
                    empty="No arrivals today"
                    emptyIcon={LogIn}
                  />
                </ScrollBox>
              </Panel>
              <Panel title="Departures" count={day.data.departures.length} contentClassName="p-0">
                <ScrollBox className={listBox}>
                  <BookingList
                    rows={day.data.departures}
                    empty="No departures today"
                    emptyIcon={LogOut}
                  />
                </ScrollBox>
              </Panel>
              <Panel title="In house" count={day.data.inHouse.length} contentClassName="p-0">
                <ScrollBox className={listBox}>
                  <BookingList
                    rows={day.data.inHouse}
                    empty="Nobody is staying tonight"
                    emptyIcon={BedDouble}
                    detail={({ booking }) =>
                      `${formatParty(booking.adults, booking.childAges)}, leaves ${formatDate(booking.checkOut)}`
                    }
                  />
                </ScrollBox>
              </Panel>
              {brief.data && <GapsPanel brief={brief.data} listClassName={listBox} />}
            </div>
          )}
        </div>
      </PageBody>
    </>
  );
}
