import type { PricingConfig } from '@orbit/shared';
import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { ErrorNotice } from '@/components/error-notice';
import { PageBody, PageHeader } from '@/components/page-header';
import { RateOutlook } from '@/components/rate-outlook';
import { RatesEditor } from '@/components/rates-editor';
import { ReadOnlyNotice, SaveBar } from '@/components/save-bar';
import { Segmented } from '@/components/segmented';
import { Skeleton } from '@/components/ui/skeleton';
import { useSession } from '@/hooks/use-session';
import { usePricing, useSavePricing } from '@/lib/api';
import { sameSettings } from '@/lib/settings';

type RatesView = 'outlook' | 'rules';

const views: { value: RatesView; label: string }[] = [
  { value: 'outlook', label: 'Outlook' },
  { value: 'rules', label: 'Rules' },
];

/**
 * Rates: the outlook of the coming nights with suggested changes, and the rules every quote is
 * computed from (currency and taxes, seasons, discounts and add-on prices).
 */
export function RatesPage() {
  const [params, setParams] = useSearchParams();
  const view: RatesView = params.get('view') === 'rules' ? 'rules' : 'outlook';
  const { canManage } = useSession();

  return (
    <>
      <PageHeader
        title="Rates"
        actions={
          <Segmented
            label="View"
            size="sm"
            value={view}
            options={views}
            onChange={(v) => setParams(v === 'rules' ? { view: v } : {}, { replace: true })}
          />
        }
      />
      {view === 'outlook' ? (
        <PageBody>
          <RateOutlook canManage={canManage} />
        </PageBody>
      ) : (
        <RateRules canManage={canManage} />
      )}
    </>
  );
}

function RateRules({ canManage }: { canManage: boolean }) {
  const pricing = usePricing();
  const save = useSavePricing();
  const [draft, setDraft] = useState<PricingConfig | null>(null);
  const current = draft ?? pricing.data;
  const dirty = draft !== null && pricing.data !== undefined && !sameSettings(draft, pricing.data);

  return (
    <>
      <PageBody>
        <div className="flex max-w-3xl flex-col gap-6">
          <ReadOnlyNotice what="the rates" />
          {pricing.isError ? (
            <ErrorNotice message={pricing.error.message} />
          ) : !current ? (
            <Skeleton className="h-80" />
          ) : (
            <fieldset disabled={!canManage} className="min-w-0">
              <RatesEditor
                pricing={current}
                onChange={(next) => {
                  save.reset();
                  setDraft(next);
                }}
                readOnly={!canManage}
              />
            </fieldset>
          )}
        </div>
      </PageBody>
      <SaveBar
        save={save}
        dirty={dirty}
        onSave={() => draft && save.mutate(draft, { onSuccess: () => setDraft(null) })}
        onDiscard={() => setDraft(null)}
        unsaved="Unsaved changes. Existing bookings keep their price."
        saved="Saved. New quotes use these rates; existing bookings keep their price."
      />
    </>
  );
}
