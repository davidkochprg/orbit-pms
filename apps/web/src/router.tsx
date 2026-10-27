import { createBrowserRouter } from 'react-router';
import { AppLayout } from '@/components/app-layout';
import { DashboardPage } from '@/pages/dashboard';
import { GuestDetailPage } from '@/pages/guest-detail';
import { GuestsPage } from '@/pages/guests';
import { InboxPage } from '@/pages/inbox';
import { HousekeepingPage } from '@/pages/housekeeping';
import { NotFoundPage } from '@/pages/sections';
import { SettingsPage } from '@/pages/settings';
import { TapeChartPage } from '@/pages/tape-chart';

export const router = createBrowserRouter([
  {
    element: <AppLayout />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'tape-chart', element: <TapeChartPage /> },
      { path: 'inbox', element: <InboxPage /> },
      { path: 'inbox/:id', element: <InboxPage /> },
      { path: 'housekeeping', element: <HousekeepingPage /> },
      { path: 'guests', element: <GuestsPage /> },
      { path: 'guests/:id', element: <GuestDetailPage /> },
      { path: 'settings/:section?', element: <SettingsPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);
