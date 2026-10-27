import { BookingSummaryTable } from '@/components/booking-summary-table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useDayOverview } from '@/lib/api';
import { formatDate } from '@/lib/format';

export function DashboardPage() {
  const day = useDayOverview();

  if (day.isError) return <p className="text-destructive">{day.error.message}</p>;
  if (!day.data) return <Skeleton className="h-64 w-full" />;

  const { date, arrivals, departures, inHouse } = day.data;
  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-muted-foreground">{formatDate(date)}</p>
      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Arrivals ({arrivals.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <BookingSummaryTable rows={arrivals} empty="No arrivals today." />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Departures ({departures.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <BookingSummaryTable rows={departures} empty="No departures today." />
          </CardContent>
        </Card>
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>In house ({inHouse.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <BookingSummaryTable rows={inHouse} empty="Nobody is staying over." />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
