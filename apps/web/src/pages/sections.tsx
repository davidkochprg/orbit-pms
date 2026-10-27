import { BedDouble, Compass } from 'lucide-react';
import { PlaceholderPage } from './placeholder-page';

export function HousekeepingPage() {
  return (
    <PlaceholderPage
      icon={BedDouble}
      title="Housekeeping"
      description="Room status board and maintenance tasks."
    />
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
