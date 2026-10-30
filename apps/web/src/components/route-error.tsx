import { CircleAlert } from 'lucide-react';
import { isRouteErrorResponse, Link, useRouteError } from 'react-router';
import { EmptyState } from '@/components/empty-state';
import { PageBody, PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';

/** A page crashed: the error shows in the workspace and the sidebar keeps working. */
export function PageError() {
  return (
    <>
      <PageHeader title="Something went wrong" />
      <PageBody>
        <ErrorBody />
      </PageBody>
    </>
  );
}

/** The app shell itself crashed, so there is no sidebar to fall back on. */
export function AppError() {
  return (
    <main className="flex min-h-svh items-start justify-center bg-background px-4 text-foreground">
      <ErrorBody />
    </main>
  );
}

function ErrorBody() {
  const error = useRouteError();
  const { message, stack } = describe(error);

  return (
    <div className="mx-auto w-full max-w-2xl">
      <EmptyState
        icon={CircleAlert}
        title="This page hit an error"
        action={
          <div className="flex gap-2">
            <Button size="sm" onClick={() => window.location.reload()}>
              Reload
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link to="/">Go to Today</Link>
            </Button>
          </div>
        }
        className="mt-16"
      />
      {import.meta.env.DEV && (
        <details className="mt-4 rounded-lg border bg-muted/40 text-xs">
          <summary className="cursor-pointer px-3 py-2 font-medium text-muted-foreground">
            {message}
          </summary>
          {stack && (
            <pre className="scrollbar-thin overflow-auto border-t px-3 py-2 font-mono text-muted-foreground">
              {stack}
            </pre>
          )}
        </details>
      )}
    </div>
  );
}

function describe(error: unknown): { message: string; stack?: string } {
  if (isRouteErrorResponse(error)) return { message: `${error.status} ${error.statusText}` };
  if (error instanceof Error) return { message: error.message, stack: error.stack };
  return { message: String(error) };
}
