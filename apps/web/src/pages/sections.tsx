import { Compass } from 'lucide-react';
import { Link } from 'react-router';
import { EmptyState } from '@/components/empty-state';
import { PageBody, PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';

export function NotFoundPage() {
  return (
    <>
      <PageHeader title="Not found" />
      <PageBody>
        <EmptyState
          icon={Compass}
          title="This page doesn’t exist"
          action={
            <Button variant="outline" size="sm" asChild>
              <Link to="/">Go to Today</Link>
            </Button>
          }
          className="mt-16"
        />
      </PageBody>
    </>
  );
}
