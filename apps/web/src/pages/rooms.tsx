import { PageBody, PageHeader } from '@/components/page-header';
import { RoomsEditor } from '@/components/rooms-editor';
import { ReadOnlyNotice } from '@/components/save-bar';
import { useSession } from '@/hooks/use-session';

/** Room types with their base prices, and the rooms themselves. */
export function RoomsPage() {
  const { canManage } = useSession();
  return (
    <>
      <PageHeader title="Rooms" />
      <PageBody>
        <div className="flex max-w-3xl flex-col gap-6">
          <ReadOnlyNotice what="rooms" />
          <RoomsEditor readOnly={!canManage} />
        </div>
      </PageBody>
    </>
  );
}
