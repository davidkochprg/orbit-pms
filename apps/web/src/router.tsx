import { createBrowserRouter, Navigate } from 'react-router';
import { AccessGate } from '@/components/access-gate';
import { AppError, PageError } from '@/components/route-error';

/**
 * Pages load on first visit, so the phone scan pages and the first screen don't download the
 * whole app. A blank page in the app's background shows while the first one loads.
 */
const loading = <div className="min-h-svh bg-background" />;

export const router = createBrowserRouter([
  {
    hydrateFallbackElement: loading,
    children: [
      // Opened on a phone from the desk's QR code: no sign-in, no access code, no app chrome.
      {
        path: 'scan/:id',
        lazy: () => import('@/pages/scan').then((m) => ({ Component: m.ScanPage })),
      },
      {
        path: 'bill-scan/:id',
        lazy: () => import('@/pages/bill-scan').then((m) => ({ Component: m.BillScanPage })),
      },
      {
        element: <AccessGate />,
        children: [
          {
            path: 'welcome',
            lazy: () => import('@/pages/welcome').then((m) => ({ Component: m.WelcomePage })),
          },
          {
            lazy: () => import('@/components/app-layout').then((m) => ({ Component: m.AppLayout })),
            errorElement: <AppError />,
            children: [
              {
                // Catches page crashes inside the workspace; navigating away clears it.
                errorElement: <PageError />,
                children: [
                  {
                    index: true,
                    lazy: () =>
                      import('@/pages/dashboard').then((m) => ({ Component: m.DashboardPage })),
                  },
                  {
                    path: 'tape-chart',
                    lazy: () =>
                      import('@/pages/tape-chart').then((m) => ({ Component: m.TapeChartPage })),
                  },
                  {
                    path: 'inbox',
                    lazy: () => import('@/pages/inbox').then((m) => ({ Component: m.InboxPage })),
                  },
                  {
                    path: 'inbox/:id',
                    lazy: () => import('@/pages/inbox').then((m) => ({ Component: m.InboxPage })),
                  },
                  {
                    path: 'housekeeping',
                    lazy: () =>
                      import('@/pages/housekeeping').then((m) => ({
                        Component: m.HousekeepingPage,
                      })),
                  },
                  {
                    path: 'guests',
                    lazy: () => import('@/pages/guests').then((m) => ({ Component: m.GuestsPage })),
                  },
                  {
                    path: 'guests/:id',
                    lazy: () =>
                      import('@/pages/guests').then((m) => ({ Component: m.GuestRedirect })),
                  },
                  // Rooms moved into Settings; old links still land there.
                  { path: 'rooms', element: <Navigate to="/settings/rooms" replace /> },
                  {
                    path: 'rates',
                    lazy: () => import('@/pages/rates').then((m) => ({ Component: m.RatesPage })),
                  },
                  {
                    path: 'reports',
                    lazy: () =>
                      import('@/pages/reports').then((m) => ({ Component: m.ReportsPage })),
                  },
                  {
                    path: 'activity',
                    lazy: () =>
                      import('@/pages/activity').then((m) => ({ Component: m.ActivityPage })),
                  },
                  {
                    path: 'knowledge',
                    lazy: () =>
                      import('@/pages/knowledge').then((m) => ({ Component: m.KnowledgePage })),
                  },
                  {
                    path: 'contacts',
                    lazy: () =>
                      import('@/pages/contacts').then((m) => ({ Component: m.ContactsPage })),
                  },
                  {
                    path: 'invoices',
                    lazy: () =>
                      import('@/pages/invoices').then((m) => ({ Component: m.InvoicesPage })),
                  },
                  {
                    path: 'settings/:section?',
                    lazy: () =>
                      import('@/pages/settings').then((m) => ({ Component: m.SettingsPage })),
                  },
                  {
                    path: '*',
                    lazy: () =>
                      import('@/pages/sections').then((m) => ({ Component: m.NotFoundPage })),
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
]);
