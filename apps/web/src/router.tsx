import { createBrowserRouter } from 'react-router';
import { AccessGate } from '@/components/access-gate';
import { AppLayout } from '@/components/app-layout';
import { AppError, PageError } from '@/components/route-error';
import { DashboardPage } from '@/pages/dashboard';
import { GuestDetailPage } from '@/pages/guest-detail';
import { ReportsPage } from '@/pages/reports';
import { ActivityPage } from '@/pages/activity';
import { GuestsPage } from '@/pages/guests';
import { InboxPage } from '@/pages/inbox';
import { HousekeepingPage } from '@/pages/housekeeping';
import { ScanPage } from '@/pages/scan';
import { NotFoundPage } from '@/pages/sections';
import { SettingsPage } from '@/pages/settings';
import { TapeChartPage } from '@/pages/tape-chart';
import { WelcomePage } from '@/pages/welcome';

export const router = createBrowserRouter([
  // Opened on a phone from the desk's QR code: no sign-in, no access code, no app chrome.
  { path: 'scan/:id', element: <ScanPage /> },
  {
    element: <AccessGate />,
    children: [
      { path: 'welcome', element: <WelcomePage /> },
      {
        element: <AppLayout />,
        errorElement: <AppError />,
        children: [
          {
            // Catches page crashes inside the workspace; navigating away clears it.
            errorElement: <PageError />,
            children: [
              { index: true, element: <DashboardPage /> },
              { path: 'tape-chart', element: <TapeChartPage /> },
              { path: 'inbox', element: <InboxPage /> },
              { path: 'inbox/:id', element: <InboxPage /> },
              { path: 'housekeeping', element: <HousekeepingPage /> },
              { path: 'guests', element: <GuestsPage /> },
              { path: 'guests/:id', element: <GuestDetailPage /> },
              { path: 'reports', element: <ReportsPage /> },
              { path: 'activity', element: <ActivityPage /> },
              { path: 'settings/:section?', element: <SettingsPage /> },
              { path: '*', element: <NotFoundPage /> },
            ],
          },
        ],
      },
    ],
  },
]);
