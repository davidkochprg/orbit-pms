import { BedDouble, CalendarRange, Compass, Inbox, LayoutDashboard, Users } from 'lucide-react';
import { PlaceholderPage } from './placeholder-page';

export function DashboardPage() {
  return (
    <PlaceholderPage
      icon={LayoutDashboard}
      title="Dashboard"
      description="Today's arrivals, departures and the daily brief will appear here."
    />
  );
}

export function TapeChartPage() {
  return (
    <PlaceholderPage
      icon={CalendarRange}
      title="Tape chart"
      description="Rooms × dates with every booking on the grid."
    />
  );
}

export function InboxPage() {
  return (
    <PlaceholderPage
      icon={Inbox}
      title="Inbox"
      description="Guest inquiries, turned into quoted holds and drafted replies."
    />
  );
}

export function HousekeepingPage() {
  return (
    <PlaceholderPage
      icon={BedDouble}
      title="Housekeeping"
      description="Room status board and maintenance tasks."
    />
  );
}

export function GuestsPage() {
  return (
    <PlaceholderPage icon={Users} title="Guests" description="Guest list with booking history." />
  );
}

export function NotFoundPage() {
  return (
    <PlaceholderPage
      icon={Compass}
      title="Page not found"
      description="Pick a section from the sidebar."
    />
  );
}
