import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router';
import { ThemeProvider } from '@/components/theme-provider';
import { ToastProvider } from '@/components/toast-provider';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ApiRequestError } from '@/lib/api';
import { router } from '@/router';

// The access cookie ran out or the code changed: check again, which brings back the code page.
function recheckAccess(err: Error) {
  if (err instanceof ApiRequestError && err.code === 'access_required') {
    void queryClient.invalidateQueries({ queryKey: ['access'] });
  }
}

const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError: recheckAccess }),
  mutationCache: new MutationCache({ onError: recheckAccess }),
  defaultOptions: { queries: { staleTime: 10_000, retry: 1 } },
});

export function App() {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <ToastProvider>
            <RouterProvider router={router} />
          </ToastProvider>
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
