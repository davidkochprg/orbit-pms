import { createBrowserRouter } from 'react-router';
import { AppLayout } from '@/components/app-layout';
import {
  DashboardPage,
  GuestsPage,
  HousekeepingPage,
  InboxPage,
  NotFoundPage,
  TapeChartPage,
} from '@/pages/sections';

export const router = createBrowserRouter([
  {
    element: <AppLayout />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'tape-chart', element: <TapeChartPage /> },
      { path: 'inbox', element: <InboxPage /> },
      { path: 'housekeeping', element: <HousekeepingPage /> },
      { path: 'guests', element: <GuestsPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);
