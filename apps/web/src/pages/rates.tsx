import { Navigate, useSearchParams } from 'react-router';
import { PageBody, PageHeader } from '@/components/page-header';
import { RateOutlook } from '@/components/rate-outlook';
import { useSession } from '@/hooks/use-session';

/**
 * Rates: the outlook of the coming nights with suggested changes. The rules every quote is
 * computed from are in Settings → Rates.
 */
export function RatesPage() {
  const [params] = useSearchParams();
  const { canManage } = useSession();
  // The rules used to be a view here; old links still land on them.
  if (params.get('view') === 'rules') return <Navigate to="/settings/rates" replace />;
  return (
    <>
      <PageHeader title="Rates" />
      <PageBody>
        <RateOutlook canManage={canManage} />
      </PageBody>
    </>
  );
}
